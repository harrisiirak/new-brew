'use strict';

const fs = require('fs');
const ejs = require('ejs');
const moment = require('moment-timezone');

function generateDocument (products, template = 'default', path = './build/') {
  return new Promise((resolve, reject) => {
    const data = {
      products,
      updated: moment().tz('Europe/Tallinn').format('YYYY-MM-DD HH:mm:ss')
    };

    ejs.renderFile(__dirname + '/templates/' + template + '.ejs', data, data, (err, str) => {
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
