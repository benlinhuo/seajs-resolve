/**
 * module.js - The core of module loader
 */

var cachedMods = seajs.cache = {}
var anonymousMeta

var fetchingList = {}
var fetchedList = {}
var callbackList = {}

var STATUS = Module.STATUS = {
  // 1 - The `module.uri` is being fetched
  FETCHING: 1,
  // 2 - The meta data has been saved to cachedMods
  SAVED: 2,
  // 3 - The `module.dependencies` are being loaded
  LOADING: 3,
  // 4 - The module are ready to execute
  LOADED: 4,
  // 5 - The module is being executed
  EXECUTING: 5,
  // 6 - The `module.exports` is available
  EXECUTED: 6
}


function Module(uri, deps) {
  this.uri = uri
  this.dependencies = deps || []
  this.exports = null
  this.status = 0

  // Who depends on me
  this._waitings = {}

  // The number of unloaded dependencies
  this._remain = 0
}

// Resolve module.dependencies
Module.prototype.resolve = function() {
  var mod = this
  var ids = mod.dependencies
  var uris = []

  for (var i = 0, len = ids.length; i < len; i++) {
    uris[i] = Module.resolve(ids[i], mod.uri)
  }
  return uris
}

// Load module.dependencies and fire onload when all done
Module.prototype.load = function() {
  var mod = this

  // If the module is being loaded, just wait it onload call
  if (mod.status >= STATUS.LOADING) {
    return
  }

  mod.status = STATUS.LOADING

  // Emit `load` event for plugins such as combo plugin
  var uris = mod.resolve()
  emit("load", uris)

  var len = mod._remain = uris.length
  var m

  // Initialize modules and register waitings
  for (var i = 0; i < len; i++) {
    m = Module.get(uris[i])

    if (m.status < STATUS.LOADED) {
      // Maybe duplicate: When module has dupliate dependency, it should be it's count, not 1
      m._waitings[mod.uri] = (m._waitings[mod.uri] || 0) + 1
    }
    else {
      mod._remain--
    }
  }

  if (mod._remain === 0) {
    mod.onload()
    return
  }

  // Begin parallel loading
  var requestCache = {}

  for (i = 0; i < len; i++) {
    m = cachedMods[uris[i]]

    if (m.status < STATUS.FETCHING) {
      m.fetch(requestCache)
    }
    else if (m.status === STATUS.SAVED) {
      m.load()
    }
  }

  // Send all requests at last to avoid cache bug in IE6-9. Issues#808
  for (var requestUri in requestCache) {
    if (requestCache.hasOwnProperty(requestUri)) {
      requestCache[requestUri]()
    }
  }
}

// Call this method when module is loaded
Module.prototype.onload = function() {
  var mod = this
  mod.status = STATUS.LOADED

  //看代码是，只有use的模块，才会在刚一开始的时候,mod.callback = function() {}。其他的mod不会有callback。
  //该callback 的用途阐述：为了执行use引入的入口模块，我们需要加载一系列的模块（也就是我们实现业务的所有模块）。
  //这些模块是因为彼此的依赖关系而决定先加载某模块，再加载其他某个模块的，这些所有模块加载（fetch）结束以后
  //（一定是所有模块加载结束以后，其实它们的状态都已经达到loaded［除了use该匿名模块以外］才会执行use模块的callback）。
  //callback内容：
  if (mod.callback) {
    mod.callback()
  }

  // Notify waiting modules to fire onload
  var waitings = mod._waitings
  var uri, m

  //检查因为mod这个模块的加载，是否可以让之前等待该模块的其他模块进入下一个状态了。
  for (uri in waitings) {
    if (waitings.hasOwnProperty(uri)) {
      m = cachedMods[uri]
      m._remain -= waitings[uri]
      //此处如果m._remain＝＝0表示m模块可以进入下一个状态了，如果不行，就让该模块还处于当前状态等着。
      if (m._remain === 0) {
        m.onload()
      }
    }
  }

  // Reduce memory taken
  delete mod._waitings
  delete mod._remain
}

// Fetch a module
Module.prototype.fetch = function(requestCache) {
  var mod = this
  var uri = mod.uri

  mod.status = STATUS.FETCHING

  // Emit `fetch` event for plugins such as combo plugin
  var emitData = { uri: uri }
  emit("fetch", emitData)
  var requestUri = emitData.requestUri || uri

  // Empty uri or a non-CMD module
  if (!requestUri || fetchedList[requestUri]) {
    mod.load()
    return
  }

  if (fetchingList[requestUri]) {
    callbackList[requestUri].push(mod)
    return
  }

  fetchingList[requestUri] = true
  callbackList[requestUri] = [mod]

  // Emit `request` event for plugins such as text plugin
  emit("request", emitData = {
    uri: uri,
    requestUri: requestUri,
    onRequest: onRequest,
    charset: data.charset
  })

  if (!emitData.requested) {
    requestCache ?
        requestCache[emitData.requestUri] = sendRequest :
        sendRequest()
  }

  function sendRequest() {
    seajs.request(emitData.requestUri, emitData.onRequest, emitData.charset)
  }

  function onRequest() {
    delete fetchingList[requestUri]
    fetchedList[requestUri] = true

    // Save meta data of anonymous module
    if (anonymousMeta) {
      Module.save(uri, anonymousMeta)
      anonymousMeta = null
    }

    // Call callbacks
    var m, mods = callbackList[requestUri]
    delete callbackList[requestUri]
    while ((m = mods.shift())) m.load()
  }
}

// Execute a module
Module.prototype.exec = function () {
  var mod = this

  // When module is executed, DO NOT execute it again. When module
  // is being executed, just return `module.exports` too, for avoiding
  // circularly calling
  if (mod.status >= STATUS.EXECUTING) {
    return mod.exports
  }

  mod.status = STATUS.EXECUTING

  // Create require
  var uri = mod.uri

  function require(id) {
    return Module.get(require.resolve(id)).exec()
  }

  require.resolve = function(id) {
    return Module.resolve(id, uri)
  }

  require.async = function(ids, callback) {
    Module.use(ids, callback, uri + "_async_" + cid())
    return require
  }

  // Exec factory
  var factory = mod.factory

  var exports = isFunction(factory) ?
      factory(require, mod.exports = {}, mod) :
      factory

  //当我们在define中使用return {}的方式返回给外部引用的方法
  if (exports === undefined) {
    exports = mod.exports
  }

  // Reduce memory leak
  delete mod.factory

  mod.exports = exports
  mod.status = STATUS.EXECUTED

  // Emit `exec` event
  emit("exec", mod)

  return exports
}

// Resolve id to uri
Module.resolve = function(id, refUri) {
  // Emit `resolve` event for plugins such as text plugin
  var emitData = { id: id, refUri: refUri }
  emit("resolve", emitData)

  return emitData.uri || seajs.resolve(emitData.id, refUri)
}

// Define a module
Module.define = function (id, deps, factory) {
  var argsLen = arguments.length

  // define(factory)
  if (argsLen === 1) {
    factory = id
    id = undefined
  }
  else if (argsLen === 2) {
    factory = deps

    // define(deps, factory)
    if (isArray(id)) {
      deps = id
      id = undefined
    }
    // define(id, factory)
    else {
      deps = undefined
    }
  }

  // Parse dependencies according to the module factory code
  if (!isArray(deps) && isFunction(factory)) {
    deps = parseDependencies(factory.toString())
  }

  var meta = {
    id: id,
    uri: Module.resolve(id),
    deps: deps,
    factory: factory
  }

  // Try to derive uri in IE6-9 for anonymous modules  匿名模块
  if (!meta.uri && doc.attachEvent) {
    var script = getCurrentScript()

    if (script) {
      meta.uri = script.src
    }

    // NOTE: If the id-deriving methods above is failed, then falls back
    // to use onload event to get the uri
  }

  // Emit `define` event, used in nocache plugin, seajs node version etc
  emit("define", meta)

// 如果meta.uri为null，则将meta先保存为anonymousMeta之后，在onload函数中执行保存的操作。
  meta.uri ? Module.save(meta.uri, meta) :
      // Save information for "saving" work in the script onload event
      anonymousMeta = meta
}

// Save meta data to cachedMods
Module.save = function(uri, meta) {
  var mod = Module.get(uri)

  // Do NOT override already saved modules
  if (mod.status < STATUS.SAVED) {
    mod.id = meta.id || uri
    mod.dependencies = meta.deps || []
    mod.factory = meta.factory
    mod.status = STATUS.SAVED

    emit("save", mod)
  }
}

// Get an existed module or create a new one
Module.get = function(uri, deps) {
  return cachedMods[uri] || (cachedMods[uri] = new Module(uri, deps))
}

// Use function is equal to load a anonymous module
Module.use = function (ids, callback, uri) {
  var mod = Module.get(uri, isArray(ids) ? ids : [ids])

  mod.callback = function() {
    var exports = []
    var uris = mod.resolve()

    for (var i = 0, len = uris.length; i < len; i++) {
      exports[i] = cachedMods[uris[i]].exec()
    }

    if (callback) {
      callback.apply(global, exports)
    }
    //use如果有callback的话，callback的形式是：callback(［依赖模块exports数组］)

    delete mod.callback
  }

  mod.load()
}


// Public API

seajs.use = function(ids, callback) {
  Module.use(ids, callback, data.cwd + "_use_" + cid())
  return seajs
}

Module.define.cmd = {}
global.define = Module.define


// For Developers

seajs.Module = Module
data.fetchedList = fetchedList
data.cid = cid

seajs.require = function(id) {
  var mod = Module.get(Module.resolve(id))
  if (mod.status < STATUS.EXECUTING) {
    mod.onload()
    mod.exec()
  }
  return mod.exports
}


/*
从seajs.use()开始，再从一个例子理下这个文件中的各个函数做啥用。也可以找个解析的东西（对着过一遍，可能版本不一样。但是大致意思应该一样）
*/


// 模块的resolve方法，用于将模块的ID剖析成对应的URI。
Module.resolve = function(id, refUri) {
    // 首先定义好事件的携带数据。其中有ID和参照URI。
    var emitData = { id: id, refUri: refUri }
    // 发出resolve事件
    emit("resolve", emitData)
    // 若resolve事件的监听器设置了URI，将其返回。
    // 否则，使用方法id2Uri将ID剖析成URI。
    return emitData.uri || id2Uri(emitData.id, refUri)
}

源码解析包括：
1. 代码组织架构：既有prototype，又有直接在对象上挂对象
2. 代码的每行解析

(function(){
    var obj = {url: 'wwww.baidu.com'};
    console.log(obj, 'before');
    test(obj);
    console.log(obj, 'after');
})();

function test(obj) {
    obj.testVal = '111111';
}

seajs是一个全局变量

  1 intro.js => sea.js => util-lang.js => util-events.js => util.path.js => util.request-css.js => util-deps.js => module.js
    => config.js => outro.js

config：用户指定的配置覆盖之前的配置的默认配置。配置在data中，在其他地方直接用data.alias或者data.base等引用最新的用户配置

seajs.use()。它主要是用于开启某一个模块的使用，实际上就是使用之前define的一个模块，且不需要被其他模块调用，即相当于定义一个匿名模块define()。
各个模块之间都互相依赖，总是需要一个领头羊牵着，才能开始后面的奔跑。该匿名模块，其实在seajs源码里面是自动帮其生成了一个uri（即名字），
然后该匿名模块指定需要执行的模块就作为该匿名模块的依赖模块处理。

该依赖模块需要被执行


很多对象的key值，是某个文件（模块）的绝对路径或者相对路径（该相对路径是用户自己指定的）

在这么多模块彼此依赖的情况下，遇到依赖项，则会请求一次（script标签），这样多一个模块就会多一次请求。
实际上，应该是有打包功能解除这个影响性能的问题。具体怎么做，待定？？？？？


问题1:
Module.prototype.resolve = function() {}中mod.dependencies如何获取到的？
答：在define中会有用正则表达式去匹配得到require的模块，作为dependencies.

问题2:
多个模块引用同一个模块，如何保证它不被请求多次？
答：其实对于一个模块，我们都给予它多个状态（mod.status:FETCHING,SAVED...），
在判断依赖模块是否需要请求时，可以通过这些状态去判断，模块现在已经是个啥状态了。
如当前判断它是否已经FETCHING过了，如果是就可以直接进入下一个阶段。
即在不同的处理阶段，会去判断它所需要的状态，如果已经完成的话，就直接跳到下一个状态。

问题3:
为什么我们就直接可以通过module.exports或者exports.xxxx导出可以被外部引用的方法，exports为什么又说是module.exports的一个引用？
因为我们在exec函数中可以看到，在执行factory时factory(require, mod.exports = {}, mod).
即把mod.exports作为define(require, exports, module)中的exports。所以我们说exports时module.exports的一个引用。
```javascript
var exports = isFunction(factory) ?
      factory(require, mod.exports = {}, mod) :
      factory

  if (exports === undefined) {
    exports = mod.exports
  }
```
看以上代码可知，当我们如果factory有return的时候，它的优先级是最高的。其次我们是把mod.exports赋值给exports，也就是说module.exports的优先级高于exports.
通过exports.xxx是可以把xxx方法导出给外部使用的。因为我们把exports作为一个对象，所以挂载在它身上的方法都可以被使用。
说明一：如下写法错误原因：
```javascript
define(function(require,exports){
  // 错误用法！！!
  exports={
    foo:'bar',
    doSomething:function(){}
  };
});
```
原因：其实我们是传递mod.exports给exports，所以如果我们在define内部重写了exports。而在seajs中引用的还是mod.exports。
其实被改变指向的exports已经跟mod.exports没啥关系了。
说明二：以下写法也是ok的
```javascript
define({
  foo:'bar',
  doSomething:function(){}
});
```
原因：因为我们上面定义exports的时候，有判断factory不是Function时候，就直接exports ＝ factory.


hello.html案例执行流程的解析：
最开始加载好seajs，之后执行seajs.use("examples/hello/1.0.0/main");。
由源码可以看到
1. var mod = Module.get(uri, isArray(ids) ? ids : [ids]);获取当前的use本身匿名模块。
2. 因为该本身匿名模块是不需要fetch的，所以直接load
3. 在load过程中，其实是加载该匿名模块的依赖模块（即main.js）。

4. fetch main.js（fetch的原理是：创建script标签，设置node的onload，onload中会去加载onRequest这个callback）。
    其实需要注意到的是：在请求未返回之前还是会去执行刚开始未执行结束的js代码。就暂时不会立即执行onRequest这个函数。
    即使请求回来了，会接着执行之前的js代码。所以会完成use这个过程。
5. use结束后，会先去执行返回回来的js代码，即define整体，之后才会执行onRequest.
6. 在define中，
if (!isArray(deps) && isFunction(factory)) {
    deps = parseDependencies(factory.toString())
  }

  如上，即当deps非array或者未undefined时，都会通过factory函数体（factory.toString()）去解析(通过正则匹配)得到它的依赖

7. Module.define执行结束以后，会去执行onload指定的函数onRequest。
［
增加一个知识点总结：
当我们正在执行js部分A，突然是通过js创建了一个script标签，并进行了请求，且设置了onload函数C。我们认为请求回来的js代码为B。
等待js代码请求回来以后的执行顺序：
7.1 请求回来的任何东西都会等待当前需要执行的A部分代码结束（即不干扰正在执行的流程）。
7.2 之后会先去执行请求回来的js代码B
7.3 B结束以后才会执行onload函数C
］

在执行onRequest函数中，有
if (anonymousMeta) {
      Module.save(uri, anonymousMeta)
      anonymousMeta = null
    }
即会保存关于最新请求过来的这个uri.
在Module.save中，save的还是main.js这个模块的相关信息。
mod.id = "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/static/hello/src/main.js"
mod.dependencies = ["./spinning"]
mod.factory = function (require) {

  var Spinning = require('./spinning');

  var s = new Spinning('#container');
  s.render();

}
mod.status = STATUS.SAVED;

到以上，针对main.js，完成了FETCHING和SAVED这两个状态。

8. 在onRequest函数中，最后会去m.load()，即执行main.js这个模块的load函数。即是加载main.js这个模块的依赖。
在该过程中发现，还需要加载依赖模块spinning.js模块，则这个时候会去fetch该模块。

9. fetch spinning.js这个模块，同fetch main.js这个模块过程。
fetch中代码：
```javascript
if (!emitData.requested) {
    //console.log(!!{});打印结果为true
    //从调用的情况来看，如果不考虑插件更改requestCache的值，则该值会一直为真
    requestCache ?
        requestCache[emitData.requestUri] = sendRequest :
        sendRequest()
  }

  function sendRequest() {
    //在真正的请求该模块（可能是依赖模块，也可能是自身模块）之前，是不知道当前模块是依赖于哪些模块的，因为代码都未知
    seajs.request(emitData.requestUri, emitData.onRequest, emitData.charset)
  }

  //onRequest是在该模块请求结束后执行的callback
  function onRequest() {
    delete fetchingList[requestUri]
    fetchedList[requestUri] = true

    // Save meta data of anonymous module
    if (anonymousMeta) {
      Module.save(uri, anonymousMeta)
      anonymousMeta = null
    }

    // Call callbacks
    var m, mods = callbackList[requestUri]
    delete callbackList[requestUri]
    //在通过script标签请求结束以后，状态变为FETCHING，之前有一个save()会让状态变成SAVED。
    //以下是加载该模块的依赖项（因为需要执行该模块的话，就必须要先加载该模块需要的依赖，不然会报错）。状态会变成LOADING。接下来就需要执行load函数
    while ((m = mods.shift())) m.load()
  }
```
通过以上可以看出，其实fetch过程中，只是把sendRequest这个函数赋值了，没有立即执行。
它还是回归到之前调用fetch函数的load函数中去执行这个sendRequest函数。接下来就和之前请求main.js的过程一样了。

注意的点（比较容易迷惑）：执行过程中经常会有module1的A函数调用跳转到module1的B函数调用，module1的B函数又会调用module2的A函数，...。
之后调用结束又会回到module1的A函数，所以这样的一个逻辑还是比较绕的。需要注意，当前的这个module到底是谁。

10. 在执行完main.js的load函数（调用结束后会回去，具体见9的“注意的点”）以后，会去执行新请求回来的spinning.js这个文件，即Module.define。
这时候又会发现它依赖于jquery（即define中，mod.dependencies = ["jquery"]）。它也是通过anonymousMeta这个方式去save（在onRequest函数中，
将spinning这个模块状态变成了SAVED）。
在执行完define以后，就会去执行onRequest这个函数。

11. 执行onRequest函数中，while ((m = mods.shift())) m.load()。会去执行spinning这个模块的load函数，加载spinning的依赖jquery。
在jquery中，我们知道它不再有依赖模块了。jquery会先fetch，然后执行下载下来的jquery代码（define模式）。此时执行Module.define中，
meta.uri ? Module.save(meta.uri, meta)Module.save(meta.uri, meta)。meta.uri = "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/jquery/jquery/1.10.1/jquery.js"
 :
// Save information for "saving" work in the script onload event
anonymousMeta = meta
它跟之前模块不一样，它是此处直接执行Module.save(meta.uri, meta)。meta.uri = "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/jquery/jquery/1.10.1/jquery.js"

12. 执行完jquery的define之后，执行onRequest这个函数，该函数最后会有jquery模块的load函数。接着执行jquery的load函数。
此时因为jquery没有依赖项，即mod._remain == 0。如下代码，会去执行jquery的onload函数。则彼此依赖的关系告一段落。
if (mod._remain === 0) {
    mod.onload()
    return
  }


13. 接下来就是各个模块会使用与之前相反顺序（A依赖于B，B依赖于C；相反顺序指：C－>B->A）去执行各自对应的onload函数（该函数是用于执行callback）




















