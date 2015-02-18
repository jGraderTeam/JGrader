// Created by Brian Singer and Greg Carlin in 2015.
// Copyright (c) 2015 JGrader. All rights reserved.

require('./common');
var router = express.Router();
var strftime = require('strftime');

var render = function(page, options, res) {
  switch(page) {
    case 'notFound':
      // page must be set already
      options.title = options.type.charAt(0).toUpperCase() + options.type.slice(1) + ' Not Found';
      break;
    case 'sectionList':
      options.page = 0;
      options.title = 'Your Sections';
      options.js = ['tooltip', 'teacher/sectionList'];
      options.css = ['font-awesome.min'];
      break;
    case 'sectionCreate':
      options.page = 0;
      options.title = 'Create a Section';
      break;
    case 'section':
      options.page = 0;
      // title must be set already
      options.js = ['tooltip', 'teacher/edit'];
      options.css = ['font-awesome.min'];
      options.strftime = strftime;
      break;
    case 'assignmentList':
      options.page = 1;
      options.title = 'Your Assignments';
      options.js = ['tooltip', 'teacher/assignmentList'];
      options.css = ['font-awesome.min'];
      options.strftime = strftime;
      break;
    case 'assignmentCreate':
      options.page = 1;
      options.title = 'Create an Assignment';
      options.js = ['teacher/jquery.datetimepicker', 'teacher/datepicker'];
      options.css = ['jquery.datetimepicker'];
      break;
    case 'assignment':
      options.page = 1;
      // title must be set already
      options.js = ['tooltip', 'strftime-min', 'teacher/edit', 'teacher/jquery.datetimepicker', 'teacher/datepicker'];
      options.css = ['jquery.datetimepicker', 'font-awesome.min'];
      options.strftime = strftime;
      break;
    case 'submission':
      options.page = 1;
      // title must be set already
      options.js = ['prettify', 'teacher/submission', 'tooltip', 'teacher/edit'];
      options.css = ['prettify', 'font-awesome.min'];
      options.onload = 'prettyPrint()';
      options.strftime = strftime;
      break;
    case 'studentList':
      options.page = 2;
      options.title = 'Your Students';
      options.js = ['tooltip'];
      options.css = ['font-awesome.min'];
      break;
    case 'student':
      options.page = 2;
      // title must be set already
      options.js = ['tooltip'];
      options.css = ['font-awesome.min'];
      options.strftime = strftime;
      break;
    case 'settings':
      options.page = -1;
      options.title = 'Settings';
      break;
    case 'feedback':
      options.page = -1;
      options.title = 'Feedback';
      options.css = ['feedback'];
      break;
  }
  renderGenericTeacher(page, options, res);
}

// automatically authenticate teacher for every page in this section
router.use(function(req, res, next) {
  authTeacher(req.cookies.hash, res, function(id) {
    req.user = {id: id};
    next();
  });
});

// main teacher page, redirects to section list
router.get('/', function(req, res) {
  res.redirect('/teacher/section'); // redirect to section list
});

// page for listing sections
router.get('/section', function(req, res) {
  connection.query("SELECT \
                      `sections`.`name`,\
                      `sections`.`id`,\
                      COUNT(`enrollment`.`student_id`) AS `count`,\
                      `assignments`.`name` AS `aname`,\
                      `assignments`.`id` AS `aid`\
                    FROM `sections` \
                    LEFT JOIN `enrollment` ON `sections`.`id` = `enrollment`.`section_id` \
                    LEFT JOIN `assignments` ON `assignments`.`section_id` = `sections`.`id` \
                    AND `assignments`.`due` = \
                      (SELECT MIN(`due`) FROM `assignments` WHERE `section_id` = `sections`.`id` AND `due` > NOW()) \
                    WHERE `sections`.`teacher_id` = ? \
                    GROUP BY `sections`.`id` \
                    ORDER BY `sections`.`name` ASC", [req.user.id], function(err, rows) {
    if(err) {
      render('sectionList', {rows: [], error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else {
      render('sectionList', {rows: rows}, res);
    }
  });
});

// page for creating a new section
router.get('/section/create', function(req, res) {
  render('sectionCreate', {}, res);
});

// handles request to create a section
router.post('/section/create', function(req, res) {
  var name = req.param('name');
  if(!name || name.length <= 0) {
    render('sectionCreate', {error: 'Name cannot be blank.', name: name}, res);
  } else {
    connection.query("INSERT INTO `sections` VALUES(NULL, ?, ?, LEFT(UUID(), 5)); SELECT LAST_INSERT_ID()", [req.user.id, name], function(err, rows) {
      if(err || rows.length <= 0) {
        render('sectionCreate', {error: 'An unknown error has occurred. Please try again later.', name: name}, res);
      } else {
        res.redirect('/teacher/section/' + rows[1][0]["LAST_INSERT_ID()"]); // redirect teacher to page of newly created section
      }
    });
  }
});

// page providing info on a specific section
router.get('/section/:id', function(req, res) {
  var sectionID = req.params.id;
  if(sectionID && sectionID.length > 0) {
    connection.query("SELECT * FROM `sections` WHERE `id` = ? AND `teacher_id` = ?", [sectionID, req.user.id], function(err, rows) {
      if(err || rows.length <= 0) {
        render('notFound', {page: 0, type: 'section'}, res);
      } else {
        connection.query("SELECT \
                            `assignments`.`id` AS `aid`,\
                            `assignments`.`name` AS `aname`,\
                            `assignments`.`due`,\
                            COUNT(DISTINCT(`enrollment`.`student_id`)) AS `total`,\
                            COUNT(DISTINCT(`submissions`.`student_id`)) AS `complete`,\
                            COUNT(DISTINCT(`submissions`.`grade`)) AS `graded`\
                          FROM `assignments` \
                          LEFT JOIN `enrollment` ON `enrollment`.`section_id` = ? \
                          LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` \
                          WHERE `assignments`.`section_id` = ? \
                          GROUP BY `assignments`.`id` \
                          ORDER BY \
                            `assignments`.`due` DESC, \
                            `assignments`.`name` ASC", [sectionID, sectionID], function(err, results) {
          if(err) {
            render('notFound', {page: 0, error: 'Error getting section', type: 'section'}, res);
            throw err;
          } else {
            render('section', {title: rows[0].name, sectionName: rows[0].name, sectionID: sectionID, sectionCode: rows[0].code, rows: results}, res);
          }
        });
      }
    });
  } else {
    render('notFound', {page: 0, type: 'section'}, res);
  }
});

// POST request to update name of section
router.post('/section/:id/updatename/:name', function(req, res) {
  connection.query("UPDATE `sections` SET `name` = ? WHERE `id` = ? AND `teacher_id` = ?", [req.params.name, req.params.id, req.user.id], function(err, rows) {
    if(err) {
      res.json({code: -1}); // unknown error
      throw err;
    } else if(rows.affectedRows <= 0) {
      res.json({code: 2}); // no permission
    } else {
      res.json({code: 0, newValue: req.params.name});
    }
  });
});

// request for deleting a section
router.get('/section/:id/delete', function(req, res) {
  connection.query('DELETE FROM `sections` WHERE `id` = ? AND `teacher_id` = ? LIMIT 1', [req.params.id, req.user.id], function(err, rows) {
    if(err) {
      render('notFound', {page: 0, error: 'Unable to delete class. Please go back and try again.'}, res);
      throw err;
    } else if(rows.affectedRows <= 0) {
      render('notFound', {page: 0, error: 'You are not allowed to delete that class.'}, res);
    } else {
      connection.query("DELETE FROM `enrollment` WHERE `section_id` = ?; DELETE `assignments`,`submissions`,`files` FROM `assignments` LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` LEFT JOIN `files` ON `files`.`submission_id` = `submissions`.`id` WHERE `assignments`.`section_id` = ?", [req.params.id, req.params.id], function(err) {
        if(err) {
          render('notFound', {page: 0, error: 'Unable to delete class. Please go back and try again.'}, res);
          throw err;
        } else {
          res.redirect('/teacher/section');
        }
      });
    }
  });
});

// page that lists assignments
router.get('/assignment', function(req, res) {
  connection.query("SELECT \
                      `assignments`.`id` AS `aid`,\
                      `assignments`.`name` AS `aname`,\
                      `assignments`.`due`,\
                      `sections`.`id` AS `sid`,\
                      `sections`.`name` AS `sname`,\
                      COUNT(DISTINCT(`enrollment`.`student_id`)) AS `total`,\
                      COUNT(DISTINCT(`submissions`.`student_id`)) AS `complete`,\
                      COUNT(DISTINCT(`submissions`.`grade`)) AS `graded`\
                    FROM `assignments` \
                    JOIN `sections` ON `sections`.`id` = `assignments`.`section_id` \
                    LEFT JOIN `enrollment` ON `sections`.`id` = `enrollment`.`section_id` \
                    LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` \
                    WHERE `sections`.`teacher_id` = ? \
                    GROUP BY `assignments`.`id` \
                    ORDER BY \
                      `assignments`.`due` DESC, \
                      `assignments`.`name` ASC, \
                      `sections`.`name` ASC", [req.user.id], function(err, rows) {
    if(err) {
      render('assignmentList', {rows: [], error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else {
      render('assignmentList', {rows: rows}, res);
    }
  });
});

router.get('/assignment.csv', function(req, res) {
  connection.query("SELECT \
                      `assignments`.`name`,\
                      `sections`.`name` AS `sname`,\
                      `students`.`fname`,\
                      `students`.`lname`,\
                      `submissions`.`grade` \
                    FROM \
                      `assignments` \
                      JOIN `sections` ON `assignments`.`section_id` = `sections`.`id` \
                      JOIN `enrollment` ON `enrollment`.`section_id` = `sections`.`id` \
                      JOIN `students` ON `students`.`id` = `enrollment`.`student_id` \
                      LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` AND `submissions`.`student_id` = `students`.`id` \
                    WHERE `sections`.`teacher_id` = ? \
                    ORDER BY \
                      `assignments`.`name`,\
                      `sections`.`name`,\
                      `students`.`lname`,\
                      `students`.`fname`", [req.user.id], function(err, rows) {
    res.setHeader('Content-Disposition', 'attachment; filename=assignments.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Descrption', 'File Transfer');
    var output = 'Assignment,Section,Student,Grade\n';
    for(i in rows) {
      output += rows[i].name + ',' + rows[i].sname + ',' + rows[i].fname + ' ' + rows[i].lname + ',' + (rows[i].grade ? rows[i].grade : 'None') + '\n';
    }
    res.send(output);
  });
});

var assignmentCreate = function(req, res) {
  connection.query("SELECT `id`,`name` FROM `sections` WHERE `teacher_id` = ? ORDER BY `name` ASC", [req.user.id], function(err, rows) {
    if(err) {
      render('assignmentCreate', {error: 'An unexpected error has occurred.', rows: []}, res);
      throw err;
    } else if(rows.length <= 0) {
      render('assignmentCreate', {error: 'You must create a section before you can create an assignment.', rows: [], preselect: req.params.preselect}, res);
    } else {
      render('assignmentCreate', {rows: rows, preselect: req.params.preselect}, res);
    }
  });
}

// page for creating a new assignment
router.get('/assignment/create', assignmentCreate);

// same as above but one section is already checked
router.get('/assignment/create/:preselect', assignmentCreate);

// handles request to create an assignment
router.post('/assignment/create', function(req, res) {
  var name = req.param('name');
  var desc = req.param('desc');
  var due  = req.param('due');
  var secs = req.param('section');
  if(!name || name.length <= 0 || !due || due.length <= 0) {
    render('assignmentCreate', {error: 'Name and due date must both be filled out.', name: name, desc: desc, due: due}, res);
  } else if(!secs || secs.length <= 0) {
    render('assignmentCreate', {error: 'You must select at least one section.', name: name, desc: desc, due: due}, res);
  } else {
    for(i in secs) {
      createAssignment(req.user.id, secs[i], res, name, desc, due);
    }
    res.redirect('/teacher/assignment');
  }
});

var createAssignment = function(teacherID, sectionID, res, name, desc, due) {
  // verify that teacher owns this section
  connection.query("SELECT (SELECT `teacher_id` FROM `sections` WHERE `id` = ?) = ? AS `result`", [sectionID, teacherID], function(err, rows) {
    if(err) {
      render('assignmentCreate', {error: 'An unexpected error has occurred.', name: name, desc: desc, due: due}, res);
      throw err;
    } else if(!rows[0].result) {
      render('assignmentCreate', {error: 'An unexpected error has occurred.', name: name, desc: desc, due: due}, res);
    } else {
      if(!desc || desc.length <= 0) desc = null;
      connection.query("INSERT INTO `assignments` VALUES(NULL, ?, ?, ?, ?)", [sectionID, name, desc, due], function(err, rows) {
        if(err) {
          render('assignmentCreate', {error: 'Invalid due date.', name: name, desc: desc, due: due}, res); // probably an invalid due date. i think.
        }
        // nothing to do here
      });
    }
  });
}

router.get('/assignment/:id.csv', function(req, res) {
  connection.query("SELECT \
                      `students`.`fname`,\
                      `students`.`lname`,\
                      `submissions`.`grade`,\
                      `submissions`.`submitted`,\
                      `assignments`.`due` \
                    FROM \
                      `students` \
                      JOIN `enrollment` ON `enrollment`.`student_id` = `students`.`id` \
                      JOIN `sections` ON `sections`.`id` = `enrollment`.`section_id` \
                      JOIN `assignments` ON `assignments`.`section_id` = `sections`.`id` \
                      LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` AND `submissions`.`student_id` = `students`.`id` \
                      WHERE `assignments`.`id` = ?", [req.params.id], function(err, rows) {
    res.setHeader('Content-Disposition', 'attachment; filename=assignment_' + req.params.id + '.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Descrption', 'File Transfer');
    var output = 'Student,Submitted,Grade,Late\n';
    for(i in rows) {
      output += rows[i].fname + ' ' + rows[i].lname + ',' + (rows[i].submitted ? 'Yes' : 'No') + ',' + (rows[i].grade ? rows[i].grade : 'None') + ',' + (rows[i].submitted ? (rows[i].submitted > rows[i].due ? 'Yes' : 'No') : (rows[i].due > Date.now() ? 'Yes' : 'Not Yet')) + '\n';
    }
    res.send(output);
  });
});

router.get('/assignment/:id', function(req, res) {
  connection.query("SELECT \
                      `assignments`.`id` AS `aid`,\
                      `assignments`.`name`,\
                      `assignments`.`description`,\
                      `assignments`.`due`,\
                      `sections`.`name` AS `sname`,\
                      `sections`.`id` AS `sid` \
                    FROM `assignments`,`sections` \
                    WHERE \
                      `assignments`.`section_id` = `sections`.`id` AND \
                      `sections`.`teacher_id` = ? AND \
                      `assignments`.`id` = ?", [req.user.id, req.params.id], function(err, rows) {
    if(err) {
      render('notFound', {page: 1, type: 'assignment', error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else if(rows.length <= 0) {
      render('notFound', {page: 1, type: 'assignment'}, res);
    } else {
      connection.query("SELECT \
                          `students`.`id`,\
                          `students`.`fname`,\
                          `students`.`lname`,\
                          `submissions`.`id` AS `subID`,\
                          `submissions`.`submitted` \
                        FROM `enrollment`,`students` \
                        LEFT JOIN \
                          `submissions` ON `submissions`.`student_id` = `students`.`id` AND \
                          `submissions`.`assignment_id` = ? \
                        WHERE \
                          `enrollment`.`student_id` = `students`.`id` AND \
                          `enrollment`.`section_id` = ?", [req.params.id, rows[0].sid], function(err, results) {
        render('assignment', {title: rows[0].name, assignment: rows[0], results: results, id: req.params.id}, res);
      });
    }
  });
});

// update description
router.post('/assignment/:id/updatedesc/:desc', function(req, res) {
  if(req.params.desc.startsWith('<em>')) {
    res.json({code: 1}); // invalid input
  } else {
    connection.query("UPDATE `assignments` SET `description` = ? WHERE `id` = ? AND TEACHER_OWNS_ASSIGNMENT(?,`assignments`.`id`)", [req.params.desc, req.params.id, req.user.id], function(err, rows) {
      if(err) {
        res.json({code: -1}); // unknown error
        throw err;
      } else if(rows.affectedRows <= 0) {
        res.json({code: 2}); // invalid permissions
      } else {
        res.json({code: 0, newValue: req.params.desc}); // success
      }
    });
  }
});

// update description to nothing
router.post('/assignment/:id/updatedesc', function(req, res) {
  connection.query("UPDATE `assignments` SET `description` = NULL WHERE `id` = ? AND TEACHER_OWNS_ASSIGNMENT(?,`assignments`.`id`)", [req.params.id, req.user.id], function(err, rows) {
    if(err) {
      res.json({code: -1}); // unknown error
      throw err;
    } else if(rows.affectedRows <= 0) {
      res.json({code: 2}); // invalid permissions
    } else {
      res.json({code: 0, newValue: ''}); // success
    }
  });
});

router.post('/assignment/:id/updatedue/:due', function(req, res) {
  connection.query("UPDATE `assignments` SET `due` = ? WHERE `id` = ? AND TEACHER_OWNS_ASSIGNMENT(?,`assignments`.`id`)", [req.params.due, req.params.id, req.user.id], function(err, rows) {
    if(err) {
      res.json({code: -1}); // unknown error
      throw err;
    } else if(rows.affectedRows <= 0) {
      res.json({code: 2}); // invalid permissions
    } else {
      res.json({code: 0, newValue: req.params.due});
    }
  });
});

router.get('/assignment/:id/delete', function(req, res) {
  connection.query('DELETE FROM `assignments` WHERE `id` = ? AND TEACHER_OWNS_ASSIGNMENT(?,`id`) LIMIT 1', [req.params.id, req.user.id], function(err, rows) {
    if(err) {
      render('notFound', {page: 0, error: 'Unable to delete assignment. Please go back and try again.'}, res);
      throw err;
    } else if(rows.affectedRows <= 0) {
      render('notFound', {page: 0, error: 'You are not allowed to delete that assignment.'}, res);
    } else {
      connection.query("DELETE FROM `submissions` JOIN `files` ON `files`.`submission_id` = `submissions`.`id` WHERE `submissions`.`assignment_id` = ?", [req.params.id], function(err) {
        if(err) {
          render('notFound', {page: 0, error: 'Unable to delete assignment. Please go back and try again.'}, res);
          throw err;
        }
        res.redirect('/teacher/assignment');
      });
    }
  });
});

router.get('/submission/:id', function(req, res) {
  connection.query("SELECT \
                      `submissions`.`assignment_id`,\
                      `submissions`.`submitted`,\
                      `submissions`.`grade`,\
                      `students`.`id`,\
                      `students`.`fname`,\
                      `students`.`lname`,\
                      `assignments`.`id` AS `aid`,\
                      `assignments`.`name`,\
                      `assignments`.`due` \
                    FROM `submissions`,`students`,`assignments`,`sections` \
                    WHERE \
                      `students`.`id` = `submissions`.`student_id` AND \
                      `assignments`.`id` = `submissions`.`assignment_id` AND \
                      `submissions`.`id` = ? AND \
                      `assignments`.`section_id` = `sections`.`id` AND \
                      `sections`.`teacher_id` = ?", [req.params.id, req.user.id], function(err, subData) {
    if(err) {
      render('notFound', {page: 1, type: 'submission', error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else if(subData.length <= 0) {
      render('notFound', {page: 1, type: 'submission'}, res);
    } else {
      connection.query("SELECT `id`,`name`,`contents` FROM `files` WHERE `submission_id` = ? ORDER BY `id`", [req.params.id], function(err, fileData) {
        if(err) {
          render('submission', {title: subData[0].fname + ' ' + subData[0].lname + "'s submission to " + subData[0].name, subData: subData[0], fileData: [], error: 'Unable to retrieve file data.'}, res);
          throw err;
        } else {
          render('submission', {title: subData[0].fname + ' ' + subData[0].lname + "'s submission to " + subData[0].name, subData: subData[0], fileData: fileData}, res);
        }
      });
    }
  });
});

router.post('/submission/:id/updategrade/:grade', function(req, res) {
  // security to ensure this teacher owns this submission
  connection.query("SELECT \
                      `submissions`.`id` \
                    FROM \
                      `submissions`,`assignments`,`sections` \
                    WHERE \
                    `submissions`.`assignment_id` = `assignments`.`id` AND \
                    `assignments`.`section_id` = `sections`.`id` AND \
                    `submissions`.`id` = ? AND \
                    `sections`.`teacher_id` = ?", [req.params.id, req.user.id], function(err, rows) {
    if(isNaN(req.params.grade)) {
      res.json({code: 1}); // invalid input
    } else if(rows.length <= 0) {
      res.json({code: 2}); // invalid permissions
    } else {
      connection.query("UPDATE `submissions` SET `grade` = ? WHERE `id` = ?", [req.params.grade, req.params.id], function(err) {
        if(err) {
          res.json({code: -1}); // unknown error
        } else {
          res.json({code: 0, newValue: req.params.grade}); // success
        }
      });
    }
  });
});

router.post('/submission/:id/run/:fileIndex', function(req, res) {
  // security to ensure this teacher owns this submission and file
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
                  ORDER BY `files`.`id`", [req.params.id, req.user.id], function(err, rows) {
    if(rows.length <= 0) {
      res.json({code: 2}); // invalid permissions
    } else {
      fs.mkdir('temp/', function(err) {
        if(err.code != 'EEXIST') throw err;

        for(i in rows) {
          var name = rows[i].name;
          rows[i].className = name.substring(0, name.length - 5);
          // note: working directory seems to be one with app.js in it
          fs.writeFileSync('temp/' + rows[i].className + '.class', rows[i].compiled);
        }

        var fileIndex = req.param('fileIndex');
        if(fileIndex < rows.length) {
          // note: 'nothing' should refer to an actual policy but it doesn't. referring to something that doesn't exist seems to be the same as referring to a policy that grants nothing.
          child = exec('cd temp/ && java -Djava.security.manager -Djava.security.policy==nothing ' + rows[req.param('fileIndex')].className, {timeout: 10000 /* 10 seconds */}, function(error, stdout, stderr) {
            for(i in rows) {
              fs.unlinkSync('temp/' + rows[i].className + '.class');
            }
            if(error && error.killed) { // if timeout
              res.json({code: 0, out: '', err: 'Code took too long to execute! There may be an infinite loop somewhere.'});
            } else {
              res.json({code: 0, out: stdout, err: stderr});
            }
          });
          child.stdin.write(req.body.stdin);
          child.stdin.end(); // forces java process to end at end of stdin (otherwise it would just wait if more input was needed)
        } else {
          res.json({code: 1}); // invalid input
        }
      });
    }
  });
});

router.get('/student', function(req, res) {
  connection.query("SELECT \
                      `students`.`id`,\
                      `students`.`fname`,\
                      `students`.`lname`,\
                      `sections`.`id` AS `sid`,\
                      `sections`.`name` AS `sname`,\
                      `assignments`.`name` AS `aname`,\
                      `temp`.`id` AS `subid`,\
                      `temp2`.`avg` \
                      FROM \
                        `students` \
                        JOIN `enrollment` ON `enrollment`.`student_id` = `students`.`id` \
                        JOIN `sections` ON `sections`.`id` = `enrollment`.`section_id` \
                        LEFT JOIN \
                          (SELECT \
                              `assignment_id`,\
                              `student_id`,\
                              `submissions`.`id`,\
                              MAX(`submitted`),\
                              `assignments`.`section_id` \
                            FROM \
                              `submissions` \
                              LEFT JOIN `assignments` ON `assignments`.`id` = `assignment_id` WHERE TEACHER_OWNS_ASSIGNMENT(?,`assignment_id`) GROUP BY `student_id`,`assignments`.`section_id`) \
                          AS `temp` ON `students`.`id` = `temp`.`student_id` AND `sections`.`id` = `temp`.`section_id` \
                        LEFT JOIN `assignments` ON `assignments`.`id` = `temp`.`assignment_id` \
                        LEFT JOIN \
                          (SELECT \
                              `submissions`.`id`,\
                              `submissions`.`student_id`,\
                              AVG(`submissions`.`grade`) AS `avg`,\
                              `assignments`.`section_id` \
                            FROM \
                              (`submissions` JOIN `assignments` ON `submissions`.`assignment_id` = `assignments`.`id`) \
                            WHERE TEACHER_OWNS_ASSIGNMENT(?,`assignment_id`) \
                            GROUP BY `student_id`,`section_id`) \
                          AS `temp2` \
                          ON `students`.`id` = `temp2`.`student_id` AND `sections`.`id` = `temp2`.`section_id` \
                      WHERE \
                        `sections`.`teacher_id` = ?", [req.user.id, req.user.id, req.user.id], function(err, rows) {
    render('studentList', {rows: rows}, res);
  });
});

router.get('/student.csv', function(req, res) {
  connection.query("SELECT \
                      `assignments`.`name`,\
                      `sections`.`name` AS `sname`,\
                      `students`.`fname`,\
                      `students`.`lname`,\
                      `submissions`.`id`,\
                      `submissions`.`grade` \
                    FROM \
                      `assignments` \
                      JOIN `sections` ON `assignments`.`section_id` = `sections`.`id` \
                      JOIN `enrollment` ON `enrollment`.`section_id` = `sections`.`id` \
                      JOIN `students` ON `students`.`id` = `enrollment`.`student_id` \
                      LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` AND `submissions`.`student_id` = `students`.`id` \
                    WHERE `sections`.`teacher_id` = ? \
                    ORDER BY \
                      `students`.`lname`,\
                      `students`.`fname`,\
                      `sections`.`name`,\
                      `assignments`.`name`", [req.user.id], function(err, rows) {
    res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Descrption', 'File Transfer');
    var output = 'Student,Section,Assignment,Grade\n';
    for(i in rows) {
      output += rows[i].fname + ' ' + rows[i].lname + ',' + rows[i].sname + ',' + rows[i].name + ',' + (rows[i].grade ? rows[i].grade : (rows[i].id ? 'Not Graded' : 'Not Submitted')) + '\n';
    }
    res.send(output);
  });
});

router.get('/student/:id.csv', function(req, res) {
  connection.query("SELECT \
                      `assignments`.`name`,\
                      `sections`.`name` AS `sname`,\
                      `submissions`.`id`,\
                      `submissions`.`grade` \
                    FROM \
                      `assignments` \
                      JOIN `sections` ON `assignments`.`section_id` = `sections`.`id` \
                      JOIN `enrollment` ON `enrollment`.`section_id` = `sections`.`id` \
                      LEFT JOIN `submissions` ON `submissions`.`assignment_id` = `assignments`.`id` AND `submissions`.`student_id` = `enrollment`.`student_id` \
                    WHERE `enrollment`.`student_id` = ? AND `sections`.`teacher_id` = ?", [req.params.id, req.user.id], function(err, rows) {
    res.setHeader('Content-Disposition', 'attachment; filename=student_' + req.params.id + '.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Descrption', 'File Transfer');
    var output = 'Assignment,Section,Grade\n';
    for(i in rows) {
      output += rows[i].name + ',' + rows[i].sname + ',' + (rows[i].grade ? rows[i].grade : (rows[i].id ? 'Not Graded' : 'Not Submitted')) + '\n';
    }
    res.send(output);
  });
});

router.get('/student/:id', function(req, res) {
  connection.query("SELECT `students`.`fname`,`students`.`lname` FROM `students` WHERE `id` = ? AND SECTIONS_WITH_STUDENT(?, `students`.`id`) > 0", [req.params.id, req.user.id], function(err, result) {
    if(err) {
      render('notFound', {page: 2, type: 'student', error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else if(result.length <= 0) {
      render('notFound', {page: 2, type: 'student'}, res);
    } else {
      connection.query("SELECT \
                          `submissions`.`id`,\
                          `submissions`.`grade`,\
                          `submissions`.`submitted`,\
                          `assignments`.`name`,\
                          `assignments`.`due`,\
                          `sections`.`name` AS `sname`,\
                          `sections`.`id` AS `sid` \
                        FROM \
                          `assignments` \
                          JOIN `sections` ON `assignments`.`section_id` = `sections`.`id` \
                          JOIN `enrollment` ON `enrollment`.`section_id` = `sections`.`id` \
                          LEFT JOIN `submissions` ON `assignments`.`id` = `submissions`.`assignment_id` AND `submissions`.`student_id` = `enrollment`.`student_id` \
                        WHERE `enrollment`.`student_id` = ? AND `sections`.`teacher_id` = ?", [req.params.id, req.user.id], function(err, rows) {
        if(err) {
          render('notFound', {page: 2, type: 'student', error: 'An unexpected error has occurred.'}, res);
          throw err;
        } else {
          var name = result[0].fname + ' ' + result[0].lname;
          render('student', {title: name, name: name, rows: rows, id: req.params.id}, res);
        }
      });
    }
  });
});

// settings page
router.get('/settings', function(req, res) {
  connection.query("SELECT `fname`,`lname` FROM `teachers` WHERE `id` = ?", [req.user.id], function(err, rows) {
    if(err) {
      render('notFound', {page: -1, type: 'settings', error: 'An unexpected error has occurred.'}, res);
      throw err;
    } else {
      render('settings', {fname: rows[0].fname, lname: rows[0].lname}, res);
    }
  });
});

router.post('/settings', function(req, res) {
  var fname = req.param('fname');
  var lname = req.param('lname');
  if(isSet(fname) && isSet(lname)) {
    var oldPass = req.param('oldpass');
    var newPass = req.param('newpass');
    if(isSet(oldPass) || isSet(newPass)) {
      if(isSet(oldPass) && isSet(newPass)) {
        connection.query("UPDATE `teachers` SET `fname` = ?, `lname` = ?, `pass` = AES_ENCRYPT(?, ?) WHERE `id` = ? AND `pass` = AES_ENCRYPT(?, ?)", [fname, lname, newPass, creds.aes_key, req.user.id, oldPass, creds.aes_key], function(err, rows) {
          if(err) {
            render('notFound', {page: -1, type: 'settings', error: 'An unexpected error has occurred.'}, res);
            throw err;
          } else if(rows.affectedRows <= 0) {
            render('settings', {fname: fname, lname: lname, error: 'Incorrect password.'}, res);
          } else {
            render('settings', {fname: fname, lname: lname, msg: 'Changes saved.'}, res);
          }
        });
      } else {
        render('settings', {fname: fname, lname: lname, error: 'All fields are required to change your password.'}, res);
      }
    } else {
      connection.query("UPDATE `teachers` SET `fname` = ?, `lname` = ? WHERE `id` = ?", [fname, lname, req.user.id], function(err) {
        if(err) {
          render('notFound', {page: -1, type: 'settings', error: 'An unexpected error has occurred.'}, res);
          throw err;
        } else {
          render('settings', {fname: fname, lname: lname, msg: 'Changes saved.'}, res);
        }
      });
    }
  } else {
    if(!fname) fname = '';
    if(!lname) lname = '';
    render('settings', {fname: fname, lname: lname, error: 'You must set a valid name.'}, res);
  }
});

router.get('/feedback', function(req, res) {
  render('feedback', {}, res);
});

router.post('/feedback', function(req, res) {
  var type = req.param('type');
  if(!type || (type != 'question' && type != 'comment' && type != 'complaint' && type != 'other')) {
    type = 'other';
  }
  connection.query("SELECT `user`,`fname`,`lname` FROM `teachers` WHERE `id` = ?", [req.user.id], function(err, result) {
    if(err) throw err;

    connection.query("INSERT INTO `feedback` VALUES(NULL, ?, ?, ?, 'teacher', ?, ?, ?)", [result[0].user, result[0].fname, result[0].lname, req.headers['user-agent'], type, req.param('feedback')], function(err) {
      if(err) throw err;
      render('feedback', {success: 'Thank you for your feedback!'}, res);
    });
  });
});

module.exports = router;
