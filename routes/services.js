var express = require('express');
var router = express.Router();
var db1 = require('../db1');

var multer = require('multer');
var fs = require('fs');

var Helper = require('../Helper');

var imgDir = __dirname+'/../public/uploads/images/';
var uploadImg = multer({ dest: imgDir });

/* Image Service */
router.post('/upload/img', function(req, res, next) {
  console.log(req.body);
  if (!req.body.file_data) {
    return res.send({ result: false });
  }
  var base64Data = req.body.file_data.replace(/^data:image\/[png|jpg|jpeg|gif];base64,/, '');
  var ext = req.body.ext;
  var imgId = Helper.keygen(32);
  fs.writeFile(imgDir + '/' + imgId + '.' + ext, base64Data, 'base64', function (err) {
    if (!err) {
      return res.send({ result: 'OK', img_url: 'https://mars.shoppinggai.com/uploads/images/' + imgId + '.' + ext });
    }
    console.error(err);
  });
});

//router.post('/upload/img', uploadImg.single('imageData'), function(req, res, next) {
//  console.log(req.file);
//  res.send({ result: 'OK', img_url: 'https://mars.shoppinggai.com/uploads/images/' + req.file.filename });
//});

module.exports = router;
