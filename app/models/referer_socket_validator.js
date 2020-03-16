var Promise = require('bluebird'),
  _ = require('underscore');

function log(){
  console.log.apply(console, arguments);
}


function RefererSocketValidator(referers) {
  this.referers = referers;
  log('Referers:', this.referers);
}

var p = RefererSocketValidator.prototype;

p.validate = function (socket) {
  var self = this;
  return new Promise(function(resolve, reject){

    var referer = socket.request.headers.referer;
    var found = _.find(self.referers, function(r){
      r = (r.charAt(r.length - 1) == '/')? r : r + '/';
//      log('config ref: ' + r);
//      log('referer: ' + referer);
      return referer.indexOf(r) === 0
    });

    if(found){
      resolve(true);
    }else{
      reject(new Error('Unexpected referer: ' + referer));
    }
  });
};

exports.RefererSocketValidator = RefererSocketValidator;