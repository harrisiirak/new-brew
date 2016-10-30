'use strict';

const fs = require('fs');
const moment = require('moment');
const radix64 = require('radix-64')();
const request = require('request');
const ratebeer = require('ratebeer');
const XmlStream = require('xml-stream');
const build = require('./build');

const REGISTRY_XML_ENDPOINT = 'https://alkoreg.agri.ee/avaandmed';
const BREWERY_MAPPINGS = {
  '59N Brewing OÜ': 'Tanker',
  'Humalasulased OÜ': 'Pühaste',
  'Õllekunsti OÜ': 'Põhjala',
  'V.Kase OÜ': 'Õllevõlur'
};

function findRatebeerMetadataForProduct (product) {
  const beer = product.productName.split(' ')
    .map((part) => (part.toLocaleLowerCase()))
    .map((part) => {
      return part
        .replace(/^õlu/g, 'beer')
        .replace(/^keykeg/g, '')
        .replace(/^keg/g, '')
        .replace(/^cask/g, '')
        .replace(/^the/g, '')
        .replace(/^de/g, '')
        .replace(/\./g, '. ')
        .replace(/`|'|"|\(|\)/g, '');
    })
    .filter((part) => {
      if (/\bbrewery\b/.test(part)) {
        return false;
      }

      return true;
    });

  const brewery = product.producerName.split(' ')
    .map((part) => (part.toLocaleLowerCase()))
    .map((part) => {
      return part
        .replace(/^ales/g, '')
        .replace(/^oü/g, '')
        .replace(/\./g, '. ')
        .replace(/`|'|"|\(|\)/g, '');
    })
    .filter((part, index) => (part.length > 3 || index < 2))[0];

  return new Promise((resolve) => {
    const name = [];

    if (brewery && brewery.length >= 3 && beer.indexOf(brewery) === -1) {
      name.push(brewery + ' ' + beer.join(' '));
    }

    name.push(beer.join(' '));

    for (let i = 2, c = beer.length; i < c; i++) {
      name.push(beer.slice(0, i).join(' '));
    }

    const findBeer = (variants) => {
      if (!variants.length) {
        resolve(product);
        return;
      }
      console.log('search', variants[0]);
      ratebeer.getBeer(variants[0], (err, data) => {
        if (!err && data) {
          product.rb = data;
          resolve(product);
        } else {
          return findBeer(variants.slice(1));
        }
      });
    };

    return findBeer(name);
  });
}

function findProductsByType ({ type = 'Õlu', filterSince = null }) {
  return new Promise((resolve, reject) => {
    let products = [];
    let duplicates = [];
    let req = request(REGISTRY_XML_ENDPOINT);

    try {
      const parser = new XmlStream(req);

      parser.on('endElement: product', (product) => {
        if (product.productClass === type) {
          if (filterSince && moment(product.regEntryDate) < filterSince) {
            return;
          }

          // Map brewery name
          if (BREWERY_MAPPINGS[product.producerName]) {
            product.producerName = BREWERY_MAPPINGS[product.producerName];
          }

          if (BREWERY_MAPPINGS[product.applicantName]) {
            product.applicantName = BREWERY_MAPPINGS[product.applicantName];
          }

          product.capacity = [ product.capacity ];
          product.uid = radix64.encodeBuffer(new Buffer(
            product.productName + product.producerName
          ));
          products.push(product);
        }
      });

      parser.on('end', () => {
        // Find variantes (different sizes)
        for (const [ index, product ] of products.entries()) {
          if (duplicates.indexOf(product) !== -1) {
            continue;
          }

          const variants = products.filter((variant, variantIndex) => {
            return index !== variantIndex &&
              variant.uid === product.uid &&
              moment(variant.regEntryDate).diff(moment(product.regEntryDate), 'week') <= 4;
          });

          if (variants.length) {
            for (const variant of variants) {
              product.capacity.push(...variant.capacity);
              duplicates.push(variant);
            }
          }
        }

        // Remove duplicates
        duplicates = duplicates.filter((value, index, self) => {
          return self.indexOf(value) === index;
        });

        products = products.filter((product, index) => {
          return product && duplicates.indexOf(product) === -1;
        });

        // Sort
        products.sort((obj1, obj2) => {
          const date1 = new Date(obj1.regEntryDate);
          const date2 = new Date(obj2.regEntryDate);

          if (date1 < date2) {
            return 1;
          }

          if (date1 > date2) {
            return -1;
          }

          if (obj1.productName < obj2.productName) {
            return -1;
          }

          if (obj1.productName > obj2.productName) {
            return 1;
          }

          return 0;
        });

        // Map capacities
        products = products.map((product) => {
          product.capacity = product.capacity.filter((value, index, self) => {
            return self.indexOf(value) === index;
          });

          product.capacity.sort((obj1, obj2) => {
            if (obj1 < obj2) {
              return 1;
            }

            if (obj1 > obj2) {
              return -1;
            }

            return 0;
          });

          return product;
        });

        const pushMetadataDownload = (items) => {
          if (!items.length) {
            resolve(products);
            return;
          }

          return findRatebeerMetadataForProduct(items[0]).then(() => {
            return pushMetadataDownload(items.slice(1));
          });
        };

        return pushMetadataDownload(products);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function groupProductsByRegDate (products) {
  const groups = {};

  for (const product of products) {
    if (!groups[product.regEntryDate]) {
      groups[product.regEntryDate] = [];
    }

    groups[product.regEntryDate].push(product);
  }

  return groups;
}

findProductsByType({
  filterSince: moment().subtract(30, 'day')
}).then((products) => {
  const grouped = groupProductsByRegDate(products);
  const buildPath = [ __dirname, 'build' ].join('/');
  const productsJSONPath = [ buildPath, 'products.json' ].join('/');
  const buildPathExists = fs.existsSync(buildPath);

  if (!buildPathExists) {
    fs.mkdirSync(buildPath);
  }

  fs.writeFileSync(productsJSONPath, JSON.stringify(grouped));

  return build.generateDocument(grouped).then(() => {
    process.exit(0);
  });
}).catch((err) => {
  console.error(err);
  process.exit(-1);
});
