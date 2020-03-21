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
      return enhance.asObject(obj);
    }
  }

  enhance.avoidInsert = function avoidInsert(obj) {
    return new Proxy({}, {
      set: function (target, prop, value) {
        if (!obj.hasOwnProperty(prop)) {
          throw Error(`new propety cannot set: ${prop}`)
        }

        Reflect.set(target, prop, value);
        return true;
      }
    });
  }

  enhance.asObject = function asObject(obj) {
    const afterSetKey = '$afterSet';
    const enhanceKeys = [afterSetKey];

    enhanceKeys.forEach(enhanceKey => {
      obj[enhanceKey] = enhance.avoidInsert(obj);
    })

    return new Proxy(obj, {
      set: function (target, prop, value) {
        if (enhanceKeys.includes(prop)) {
          Reflect.set(target, prop, value);
          return true;
        }

        if (!obj.hasOwnProperty(prop)) {
          throw Error(`new propety cannot set: ${prop}`)
        }

        Reflect.set(target, prop, value);
        const listener = obj[afterSetKey][prop];
        if (listener) {
          listener(target, prop, value);
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

  enhance.asMap = function asMap(obj) {
    const afterSetKey = '$afterSet';
    const afterDeleteKey = '$afterDelete';
    const enhanceKeys = [afterSetKey, afterDeleteKey];

    enhanceKeys.forEach(enhanceKey => {
      obj[enhanceKey] = {};
    })

    return new Proxy(obj, {
      set: function (target, prop, value) {
        if (enhanceKeys.includes(prop)) {
          Reflect.set(target, prop, value);
          return true;
        }

        Reflect.set(target, prop, value);
        const listener = obj[afterSetKey];
        if (listener) {
          listener(target, prop, value);
        }
        return true;
      },
      deleteProperty: function (target, prop, value) {
        const willDelete = target[prop];
        Reflect.deleteProperty(target, prop, value);
        const listener = obj[afterDeleteKey];
        if (listener) {
          listener(target, prop, willDelete);
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
        Reflect.deleteProperty(target, prop, value);
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
          Reflect.set(target, prop, value);
          return true;
        }

        const isInsert = target[prop] === undefined;
        Reflect.set(target, prop, value);
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