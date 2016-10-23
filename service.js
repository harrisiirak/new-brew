'use strict';

const moment = require('moment');
const radix64 = require('radix-64')();
const request = require('request');
const XmlStream = require('xml-stream');

const REGISTRY_XML_ENDPOINT = 'https://alkoreg.agri.ee/avaandmed';

function findProductsByType (type) {
  return new Promise((resolve, reject) => {
    let products = [];
    let duplicates = [];
    let req = request(REGISTRY_XML_ENDPOINT);

    try {
      const parser = new XmlStream(req);

      parser.on('endElement: product', (product) => {
        if (product.productClass === type) {
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

        resolve(products.map((product) => {
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
        }));
      });
    } catch (err) {
      reject(err);
    }
  });
}

findProductsByType('Õlu').then((products) => {
  console.log(products.slice(0, 50).map((product) => {
    return {
      productName: product.productName,
      capacity: product.capacity
    };
  }));

  console.log(products[0]);
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(-1);
});
