'use strict';

const fs = require('fs');
const ejs = require('ejs');

function generateDocument (products, template = 'default', path = './build/') {
  return new Promise((resolve, reject) => {
    ejs.renderFile('./templates/' + template + '.ejs', { products }, { }, (err, str) => {
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
