'use strict';

const fs = require('fs');
const ejs = require('ejs');
const moment = require('moment');

function generateDocument (products, template = 'default', path = './build/') {
  return new Promise((resolve, reject) => {
    const data = {
      products,
      updated: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    
    ejs.renderFile('./templates/' + template + '.ejs', data, { }, (err, str) => {
      if (err) {
        reject(err);
        return;
      }

      fs.writeFileSync(path + 'index.html', str);
      resolve();
    });
  });
}

module.exports = {
  generateDocument
};
