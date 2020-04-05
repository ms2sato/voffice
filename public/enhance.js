/*
# Released under MIT License
Copyright 2020 Masashi Sato.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
(function () {
  // 簡易的なオブザーバー作成器
  // const observable = enhance({test: "111"});
  // observable.$afterSet.test = function(target, prop, value) { console.log(target, prop, value); }
  // observable.test = "123";
  window.enhance = function enhance(obj) {
    if (Array.isArray(obj)) {
      return enhance.asArray(obj);
    } else if (obj instanceof Map) {
      return enhance.asMap(obj);
    } else {
      return enhance.asModel(obj);
    }
  }

  enhance.avoidInsert = function avoidInsert(obj) {
    return new Proxy({}, {
      defineProperty(target, key, descriptor) {
        if (!obj.hasOwnProperty(key)) {
          throw Error(`new propety cannot set: ${key}`)
        }
        Reflect.defineProperty(...arguments);
        return true;
      }
    });
  }

  enhance.asModel = function asModel(obj) {
    const afterSetKey = '$afterSet';
    const enhanceKeys = [afterSetKey];

    enhanceKeys.forEach(enhanceKey => {
      obj[enhanceKey] = enhance.avoidInsert(obj);
    })

    return new Proxy(obj, {
      defineProperty(target, key, descriptor) {
        if (!obj.hasOwnProperty(key)) {
          throw Error(`new propety cannot set: ${key}`)
        }
        Reflect.defineProperty(...arguments);
        return true;
      },
      get: function(target, prop, receiver) {
        if (!target.hasOwnProperty(prop)) {
          throw Error(`undefined property access: ${prop}`)
        }
        return Reflect.get(...arguments);
      },
      set: function (target, prop, value) {
        if (enhanceKeys.includes(prop)) {
          Reflect.set(...arguments);
          return true;
        }

        if (!obj.hasOwnProperty(prop)) {
          throw Error(`new propety cannot set: ${prop}`)
        }

        Reflect.set(...arguments);
        const listener = obj[afterSetKey][prop];
        if (listener) {
          listener(target, prop, value);
        }
        return true;
      },
      ownKeys (target) {
        return Reflect.ownKeys(target).filter((key) => { return !enhanceKeys.includes(key) });
      },
      has(target, key) {
        if (enhanceKeys.includes(key)) {
          return false;
        }
        return key in target;
      }
    });
  }

  enhance.asMap = function asMap(obj) {
    const afterSetKey = '$afterSet';
    const afterDeleteKey = '$afterDelete';
    const clearKey = '$clear';
    const enhanceKeys = [afterSetKey, afterDeleteKey, clearKey];

    enhanceKeys.forEach(enhanceKey => {
      if(enhanceKey === clearKey) {
        obj[clearKey] = function() {
          for (const key of Object.getOwnPropertyNames(obj)) {
            if(!enhanceKeys.includes(key)) { delete obj[key]; }
          }
        }
      } else {
        obj[enhanceKey] = null;
      }
    });

    return new Proxy(obj, {
      set: function (target, prop, value) {
        if (enhanceKeys.includes(prop)) {
          Reflect.set(...arguments);
          return true;
        }

        Reflect.set(...arguments);
        const listener = obj[afterSetKey];
        if (listener) {
          listener(target, prop, value);
        }
        return true;
      },
      deleteProperty: function (target, prop, value) {
        const willDelete = target[prop];
        Reflect.deleteProperty(...arguments);
        const listener = obj[afterDeleteKey];
        if (listener) {
          listener(target, prop, willDelete);
        }
        return true;
      },
      ownKeys (target) {
        return Reflect.ownKeys(target).filter((key) => { return !enhanceKeys.includes(key) });
      },
      has(target, key) {
        if (enhanceKeys.includes(key)) {
          return false;
        }
        return key in target;
      }
    });
  }

  // 書いてみたものの使わなかったのでテスト不足
  enhance.asArray = function asArray(array) {
    const afterInsertKey = '$afterInsert';
    const afterUpdateKey = '$afterUpdate';
    const afterDeleteKey = '$afterDelete';
    const enhanceKeys = [afterInsertKey, afterUpdateKey, afterDeleteKey];

    enhanceKeys.forEach(enhanceKey => {
      array[enhanceKey] = enhance.avoidInsert(array);
    })

    return new Proxy(array, {
      deleteProperty: function (target, prop, value) {
        Reflect.deleteProperty(...arguments);
        if (!isNaN(prop)) {
          const listener = array[afterDeleteKey];
          if (listener) {
            listener(target, prop, value);
          }
        }
        return true;
      },
      set: function (target, prop, value) {
        if (enhanceKeys.includes(key)) {
          Reflect.set(...arguments);
          return true;
        }

        const isInsert = target[prop] === undefined;
        Reflect.set(...arguments);
        if (!isNaN(prop)) {
          const key = isInsert ? afterInsertKey : afterUpdateKey;
          const listener = array[key];
          if (listener) {
            listener(target, prop, value);
          }
        }
        return true;
      },
      has(target, key) {
        if (enhanceKeys.includes(key)) {
          return false;
        }
        return key in target;
      }
    });
  }
})();