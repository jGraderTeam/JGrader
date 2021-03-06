// Created by Brian Singer and Greg Carlin in 2015.
// Copyright (c) 2015 JGrader. All rights reserved.

require('../common');
var router = express.Router();
var strftime = require('strftime');
var JSZip = require('jszip');
var comments = require('../comments');

var render = function(page, options, res) {
  options.page = 1;
  switch(page) {
    case 'notFound':
      options.title = 'Submission Not Found';
      options.type = 'submission';
      break;
    case 'submission':
      // title must be set already
      options.js = ['prettify', 'teacher/submission', 'tooltip', 'teacher/edit', 'comments'];
      options.css = ['prettify', 'font-awesome.min'];
      options.strftime = strftime;
      break;
  }
  renderGenericTeacher(page, options, res);
}

router.use('/:id', function(req, res, next) {
  connection.query({
      sql: "SELECT * FROM `submissions` JOIN `assignments` ON `submissions`.`assignment_id` = `assignments`.`id` JOIN `sections` ON `assignments`.`section_id` = `sections`.`id` WHERE `submissions`.`id` = ? AND `sections`.`teacher_id` = ?",
      nestTables: true,
      values: [req.params.id, req.user.id]
    }, function(err, result) {
      if(err) {
        render('notFound', {error: 'An unexpected error has occurred.'}, res);
        err.handled = true;
        next(err);
      } else if(result.length <= 0) {
        render('notFound', {}, res);
      } else {
        req.submission = result[0].submissions;
        req.assignment = result[0].assignments;
        req.section = result[0].sections;
        next();
      }
    });
});

router.get('/:id', function(req, res, next) {
  connection.query("SELECT `id`,`fname`,`lname` FROM `students` WHERE `id` = ?", [req.submission.student_id], function(err, students) {
    if(err) {
      render('notFound', {error: 'An unexpected error has occurred.'}, res);
      err.handled = true;
      next(err);
    } else {
      connection.query("SELECT `id`,`name`,`contents`,`compiled` FROM `files` WHERE `submission_id` = ? ORDER BY `id`", [req.params.id], function(err, fileData) {
        if(err) {
          render('submission', {title: students[0].fname + ' ' + students[0].lname + "'s submission to " + req.assignment.name, student: students[0], fileData: [], submission: req.submission, assignment: req.assignment, error: 'Unable to retrieve file data.', anyCompiled: true}, res);
          err.handled = true;
          next(err);
        } else {
          var anyCompiled = false;
          for(file in fileData) {
            fileData[file].display = fileData[file].contents.length <= 4096 || fileData[file].compiled;
            if(fileData[file].compiled) anyCompiled = true;
          }
          render('submission', {title: students[0].fname + ' ' + students[0].lname + "'s submission to " + students[0].name, student: students[0], fileData: fileData, submission: req.submission, assignment: req.assignment, anyCompiled: anyCompiled}, res);
        }
      });
    }
  });
});

router.post('/:id/updategrade', function(req, res, next) {
  connection.query("UPDATE `submissions` SET `grade` = NULL WHERE `id` = ?", [req.params.id], function(err) {
    if(err) {
      res.json({code: -1});
      err.handled = true;
      next(err);
    } else {
      res.json({code: 0, newValue: '<em>Not graded.</em>'});
    }
  });
});

router.post('/:id/updategrade/:grade', function(req, res, next) {
  if(isNaN(req.params.grade)) {
    res.json({code: 1}); // invalid input
  } else {
    connection.query("UPDATE `submissions` SET `grade` = ? WHERE `id` = ?", [req.params.grade, req.params.id], function(err) {
      if(err) {
        res.json({code: -1}); // unknown error
        err.handled = true;
        next(err);
      } else {
        res.json({code: 0, newValue: req.params.grade}); // success
      }
    });
  }
});

var mkdir = function(dir, callback) {
  fs.mkdir(dir, function(err) {
    if(err && err.code != 'EEXIST') throw err;
    callback(null);
  });
};

// TODO get rid of async and implement proper error handling
router.post('/:id/run/:fileIndex', function(req, res) {
  var rows;
  async.waterfall([
    function(callback) {
      mkdir('temp/', callback);
    },
    function(callback) {
      mkdir('temp/' + req.params.id + '/', callback);
    },
    function(callback) {
      connection.query("SELECT \
                          `files`.`id`,\
                          `files`.`name`,\
                          `files`.`compiled` \
                        FROM `submissions`,`files` \
                        WHERE \
                          `submissions`.`id` = ? AND \
                          `files`.`submission_id` = `submissions`.`id` \
                        ORDER BY `files`.`id`", [req.params.id], callback);
    },
    function(results, fields, callback) {
      rows = results;
      if(rows.length <= 0) {
        res.json({code: 2}); // invalid permissions
      } else {
        async.each(rows, function(row, cb) {
          var name = row.name;
          row.className = name.substring(0, name.length - 5);
          // note: working directory seems to be one with app.js in it
          fs.writeFile('temp/' + req.params.id + '/' + row.className + '.class', row.compiled, cb);
        }, callback);
      }
    },
    function(callback) {
      var fileIndex = req.params.fileIndex;
      if(fileIndex < rows.length) {
        // note: 'nothing' should refer to an actual policy but it doesn't. referring to something that doesn't exist seems to be the same as referring to a policy that grants nothing.
        var child = exec('cd temp/' + req.params.id  + '/ && java -Djava.security.manager -Djava.security.policy==nothing ' + rows[req.params.fileIndex].className, {timeout: 10000 /* 10 seconds */}, function(err, stdout, stderr) {
          if(err && stderr) err = null; // suppress error if stderr is set (indicates user error)
          callback(err, stdout, stderr);
        });
        if(req.body.stdin) child.stdin.write(req.body.stdin);
        child.stdin.end(); // forces java process to end at end of stdin (otherwise it would just wait if more input was needed)
      } else {
        res.json({code: 1}); // invalid input
      }
    },
    function(stdout, stderr, callback) {
      res.json({code: 0, out: stdout, err: stderr});
      callback();
    }
    ], function(err) {
      if(err) {
        if(err.killed) {
          res.json({code: 0, out: '', err: 'Code took too long to execute! There may be an infinite loop somewhere.'});
        } else {
          res.json({code: -1});
          throw err;
        }
      } else {
        async.each(rows, function(row, cb) {
          fs.unlink('temp/' + req.params.id + '/' + row.className + '.class', cb);
        });
        fs.rmdir('temp/' + req.params.id + '/');
      }
  });
});

router.get('/:id/test/:fileIndex', function(req, res, next) {
  fs.ensureDir('temp/' + req.params.id + '/', function(err) {
    connection.query("SELECT \
                        `files`.`id`,\
                        `files`.`name`,\
                        `files`.`compiled` \
                      FROM `submissions`,`assignments`,`sections`,`files` \
                      WHERE \
                        `submissions`.`assignment_id` = `assignments`.`id` AND \
                        `assignments`.`section_id` = `sections`.`id` AND \
                        `submissions`.`id` = ? AND \
                        `sections`.`teacher_id` = ? AND \
                        `files`.`submission_id` = `submissions`.`id` \
                      ORDER BY `files`.`id`", [req.params.id, req.user.id], function(err, files) {
      if(err) {
        res.json({code: -1});
        err.handled = true;
        next(err);
      } else {
        connection.query("SELECT `id`,`input`,`output` FROM `test-cases` WHERE `assignment_id` = ?", [req.assignment.id], function(err, tests) {
          if(err) {
            res.json({code: -1});
            err.handled = true;
            next(err);
          } else {
            for(var i in files) {
              files[i].className = files[i].name.substring(0, files[i].name.length - 5);
              fs.writeFileSync('temp/' + req.params.id + '/' + files[i].className + '.class', files[i].compiled);
            }
            if(req.params.fileIndex < files.length) {
              async.mapSeries(tests, function(test, callback) {
                var child = exec('cd temp/' + req.params.id  + '/ && java -Djava.security.manager -Djava.security.policy==nothing ' + files[req.params.fileIndex].className, {timeout: 10000 /* 10 seconds */}, function(err, stdout, stderr) {
                  if(err && stderr) err = null; // suppress error if stderr is set (indicates user error)
                  if(err) {
                    if(err.killed) {
                      res.json({code: 2}); // code took too long to execute
                    } else {
                      res.json({code: -1});
                      fs.removeSync('temp/' + req.params.id + '/'); // cleanup
                      err.handled = true;
                      next(err);
                    }
                  } else {
                    if(stdout.length >= 1) {
                      // truncate last new line character
                      stdout = stdout.substring(0, stdout.length - 1);
                    }
                    callback(null, [stdout, stderr]);
                  }
                });
                child.stdin.write(test.input);
                child.stdin.end();
              }, function(err0, results) {
                fs.remove('temp/' + req.params.id + '/', function(err1) {
                  if(err0) {
                    res.json({code: -1});
                    err0.handled = true;
                    next(err0);
                  } else if(err1) {
                    res.json({code: -1});
                    err1.handled = true;
                    next(err1);
                  } else {
                    var data = [];
                    for(var i in results) {
                      data.push({input: tests[i].input, expected: tests[i].output, result: results[i][0]});
                    }
                    res.json({code: 0, results: data});
                  }
                });
              });
            } else {
              res.json({code: 1}); // invalid input
            }
          }
        });
      }
    });
  });
});

router.get('/:id/download', function(req, res, next) {
  connection.query("SELECT \
                      `files`.`id`,\
                      `files`.`name`,\
                      `files`.`contents` \
                    FROM `submissions`,`files` \
                    WHERE \
                      `submissions`.`id` = ? AND \
                      `files`.`submission_id` = `submissions`.`id` \
                    ORDER BY `files`.`id`", [req.params.id], function(err, rows) {
    if(err) {
      next(err);
    } else if(rows.length <= 0) {
      res.send('Sorry, an error has occurred.');
    } else {
      var zip = new JSZip();
      for(i in rows) {
        zip.file(rows[i].name, rows[i].contents);
      }
      var content = zip.generate({type: 'nodebuffer'});

      res.setHeader('Content-Disposition', 'attachment; filename=' + req.params.id + '.zip');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Description', 'File Transfer');
      res.send(content);
    }
  });
});

router.get('/:id/download/:fileIndex', function(req, res, next) {
  async.waterfall([
      function(callback) {
        connection.query("SELECT \
                            `files`.`id`,\
                            `files`.`name`,\
                            `files`.`contents` \
                          FROM `submissions`,`files` \
                          WHERE \
                            `submissions`.`id` = ? AND \
                            `files`.`submission_id` = `submissions`.`id` \
                          ORDER BY `files`.`id`", [req.params.id], callback);
      }
    ], function(err, rows) {
      if(err) {
        next(err);
      } else if(rows.length <= 0) {
        res.send('You do not have permission to download this file.');
      } else if(isNaN(req.params.fileIndex) || req.params.fileIndex >= rows.length) {
        res.send('Sorry, an error has occurred.');
      } else {
        res.setHeader('Content-Disposition', 'attachment; filename=' + rows[req.params.fileIndex].name);
        res.setHeader('Content-Description', 'File Transfer');
        res.send(rows[req.params.fileIndex].contents);
      }
    });
});

comments.setup(router, 'teacher');

module.exports = router;

