####module.js 模块加载器的核心代码
我们从hello.html这个案例加载模块的顺序来解读

* 1. 全局，尤其是状态（很重要，我们的模块执行流程就是按照这个来的）
```javascript
// 设置全局对象seajs的cache属性为空对象。并赋予变量cachedMods，表示缓
// 存的模块。
var cachedMods = seajs.cache = {}
// 一个匿名的元
var anonymousMeta
// 正在获取的模块列表变量，初始化为空对象。
var fetchingList = {}
// 已获取的模块列表变量，初始化为空对象。
var fetchedList = {}
// 回调列表，初始化为空对象。
var callbackList = {}
// 模块的六种状态
var STATUS = Module.STATUS = {
    // 状态一：模块正在获取中
    FETCHING: 1,
    // 状态二：模块的元数据已存入缓存中
    SAVED: 2,
    // 状态三：模块的依赖正在加载中
    LOADING: 3,
    // 状态四：模块加载完成，准备开始执行
    LOADED: 4,
    // 状态五：模块正在执行中
    EXECUTING: 5,
    // 状态六：模块执行完成，可以对外提供模块接口了。
    EXECUTED: 6
}
```


* 2. seajs.use：对外的接口。全局对象的use函数，用于加载所有的依赖IDs。参数一为所有依赖，参数二为回调函数。此处的callback是所有模块都加载完毕，且执行完毕以后，最后才执行的。由以下代码看到，接下来需要解析的是Module.preload()函数
```javascript
seajs.use = function(ids, callback) {
    // 加载上所有的预加载模块。
    Module.preload(function() {
        // 使用预加载模块的回调函数来加载所有的依赖IDs。
        Module.use(ids, callback, data.cwd + "_use_" + cid())
    })
    // 最后返回全局变量seajs以方便链式调用。
    return seajs
}
```

* 3. Module.preload：用于加载其他模块之前先加载“预加载模块”。在不考虑有预加载的模块情况下，我们直接执行了callback,即：Module.use(ids, callback, data.cwd + "_use_" + cid())。
```javascript
Module.preload = function(callback) {
    // 从全局定义中拿到需要预加载的模块。此处预加载的模块就是seajs自执行时候解析的插件
    var preloadMods = data.preload
    // 预加载模块的个数。
    var len = preloadMods.length
    // 如果有预加载模块，
    if (len) {
        // 加载所有的『预加载模块』（为了简单考虑，我们可以暂时假设没有预加载的模块）
        Module.use(preloadMods, function() {
            // 移除已加载的『预加载模块』
            preloadMods.splice(0, len)
            // 递归加载『预加载模块』的『预加载模块』。
            Module.preload(callback)
        }, data.cwd + "_preload_" + cid())
    }
    // 否则，直接调用回调函数。
    else {
        callback()
    }
}
```

* 4. Module.use(ids, callback, data.cwd + "_use_" + cid()):用于加载匿名模块（该匿名模块的URI是我们自己自动生成的,举例可以说是："file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/app/_use_0"）。参数一：依赖的模块，参数二：回调函数callback，参数三：模块的URI
```javascript
Module.use = function(ids, callback, uri) {
    // 首先获取模块
  ＊  var mod = Module.get(uri, isArray(ids) ? ids : [ids])
    // 添加模块的回调函数。只有use的这个匿名模块才会有callback,一般的业务代码是没有这个callback的。
    //并且是use这个匿名模块所依赖的模块（以及依赖模块的依赖模块，等等所有多层依赖模块）都加载完毕以后，即状态都已经到达LOADED以后，才会执行(即exec)各个模块的代码（为达到状态EXECUTED）。
    mod.callback = function() {
        var exports = []
        // 模块的所有依赖
        var uris = mod.resolve()
        // 迭代所有依赖，依次调用其执行方法，结果存入变量exports中。
        for (var i = 0, len = uris.length; i < len; i++) {
            exports[i] = cachedMods[uris[i]].exec()
        }
        // 若传入了回调函数，调用之，传入参数为全局变量global和变量exports。
        if (callback) {
            callback.apply(global, exports)
        }
        // 移除模块上的回调函数以释放内存。
        delete mod.callback
    }
    // 最后调用模块的load方法。
  ＊  mod.load()
}
```

* 5. Module.get(uri, isArray(ids) ? ids : [ids]):用于已有模块的获取或者新模块的创建,所以我们不用担心在获取的时候该模块不存在而造成错误。
```javascript
Module.get = function(uri, deps) {
    // 用URI从缓存中取出模块，若无，使用URI和依赖新建一个模块。
    return cachedMods[uri] || (cachedMods[uri] = new Module(uri, deps))
}
```

* 6. 以上4代码中第二＊号代表的代码：mod.load。因为这是个匿名模块，其实是没有fetch这个过程的，所以就直接load的了。

该方法load，是用于加载模块的所有依赖，然后在完成后触发onload事件句柄。
```javascript
Module.prototype.load = function() {
    // 当前模块
    var mod = this
    // 如果当前模块正在加载中，直接返回等待加载完成。
    if (mod.status >= STATUS.LOADING) {
        return
    }
    // 设置当前模块的状态为加载中。
    mod.status = STATUS.LOADING
    // 发出load事件以供插件(如combo插件)使用，传入的参数为当前模块的所有依赖。
    var uris = mod.resolve()
    emit("load", uris)
    // 当前模块未加载的依赖，亦需要加载的依赖的个数
    var len = mod._remain = uris.length
    // 当前模块的某一个依赖
    var m
    // 迭代需要加载的依赖
    for (var i = 0; i < len; i++) {
        // 迭代中当前的依赖
        m = Module.get(uris[i])
        // 若当前依赖还未加载完成
        if (m.status < STATUS.LOADED) {
            // 标记mod.uri正在等待m的加载。用于m在onload执行时，可以通过m._waitings来判断mod.uri是否可以接着执行下一个状态，而不需要继续在当前这个状态进行等待了
            /*
            Module.prototype.onload函数中：
                // 正在等待当前模块完成的其他模块。
                var waitings = mod._waitings
                // 定义某个uri，某个模块，用于迭代。
                var uri, m
                // 迭代这些模块，依次调用等待当前模块完成的其他模块的加载完成函数onload。
                for (uri in waitings) {
                    if (waitings.hasOwnProperty(uri)) {
                        // 从缓存中取出迭代中当前的模块
                        m = cachedMods[uri]
                        m._remain -= waitings[uri]
                        // 如果迭代中的当前模块的所有依赖都已加载，调用其onload方法。
                        if (m._remain === 0) {
                            m.onload()
                        }
                    }
                }
            */
 ＊           m._waitings[mod.uri] = (m._waitings[mod.uri] || 0) + 1
        }
        // 否则，当前模块的需要加载的依赖数减一。
        else {
            mod._remain--
        }
    }
    // 如果当前模块的所有依赖已全部加载完成，调用模块的onload方法，然后返
    // 回。
    if (mod._remain === 0) {
        mod.onload()
        return
    }
    // 并行加载（依赖项加载：执行fetch，并行是说因为创建script去请求，可以同时由多个请求，达到并行的效果）
    var requestCache = {}
    for (i = 0; i < len; i++) {
        // 从缓存的模块列表中获取某个依赖
        m = cachedMods[uris[i]]
        // 若该依赖还未开始获取，调用其fetch方法
        if (m.status < STATUS.FETCHING) {
            m.fetch(requestCache)
        }
        // 不然若其元数据已存入缓存中，调用其load方法。
        else if (m.status === STATUS.SAVED) {
            m.load()
        }
    }
    // 最后发出所有的请求，以规避在IE6-9中的缓存bug。参见Issues#808
    for (var requestUri in requestCache) {
        if (requestCache.hasOwnProperty(requestUri)) {
            requestCache[requestUri]()
        }
    }
}
```

* 7. 由上：并行加载依赖模块（["file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/static/hello/src/main.js"]，注意当前的模块还是自动生成URI的匿名模块）的代码，下面我们开始解析fetch。


```javascript
Module.prototype.fetch = function(requestCache) {
    // 当前模块
    var mod = this
    // 当前模块的URI
    var uri = mod.uri
    // 更新模块的状态为获取中
    mod.status = STATUS.FETCHING
    // 准备发出事件的携带数据
    var emitData = { uri: uri }
    // 向外发出事件fetch以供插件(如combo插件)使用
    emit("fetch", emitData)

    var requestUri = emitData.requestUri || uri
    // 如果是空的URI或非CMD模块，或者URI存在于已取列表中，调用模块的加
    // 载方法并返回。
    if (!requestUri || fetchedList[requestUri]) {
        mod.load()
        return
    }
    // 若URI存在于正在获取中列表中，将模块添加至其对应的回调函数列表中并返回。
    if (fetchingList[requestUri]) {
        callbackList[requestUri].push(mod)
        return
    }
    // 设置正在获取中列表中URI对应的为真。
    fetchingList[requestUri] = true
    // 设置回调函数列表中URI对应的为当前模块的一个数组。
    callbackList[requestUri] = [mod]
    // 发出request事件，传递参数。
    emit("request", emitData = {
        uri: uri,
        requestUri: requestUri,
        onRequest: onRequest,
        charset: data.charset
    })
    // 若请求未完成，
    if (!emitData.requested) {
        // 且传入的参数requestCache非空，将方法sendRequest赋予缓存中的
        // URI对应的值。
        // 若requestCache为空，直接调用方法sendRequest。
解析一：        requestCache ? requestCache[emitData.requestUri] = sendRequest : sendRequest()
    }
    // 定义方法sendRequest。
    function sendRequest() {
        // 调用方法request，传入参数。参数一为URI，参数二为回调函数，
        // 参数三为子符编码集。
        request(emitData.requestUri, emitData.onRequest, emitData.charset)
    }
    // 定义请求的回调函数。
    function onRequest() {
        // 移除掉获取中列表中的URI对应的引用。
        delete fetchingList[requestUri]
        // 设置已获取列表中URI对应的值为真。
        fetchedList[requestUri] = true
        // 若匿名元非空，在模块中把它保存下来，并且清空匿名元。
        if (anonymousMeta) {
            Module.save(uri, anonymousMeta)
            anonymousMeta = null
        }
        // 清空回调列表中URI对应的所有模块，对它们进行迭代，依次调用其load方法。
        var m, mods = callbackList[requestUri]
        delete callbackList[requestUri]
        while ((m = mods.shift())) m.load()
    }
}
```
以上代码解析点：

一。requestCache ? requestCache[emitData.requestUri] = sendRequest : sendRequest()。

requestCache变量是上述函数参数，调用方是6的onload中var requestCache = {}。即如果通过这种方式传递过来，则requestCache一定是{}。不过!!{}是true，所以它不会立即执行sendRequest，只是把requestCache[emitData.requestUri] = sendRequest。赋值后，sendRequest是在上述6.load函数中，遍历requestCache来执行对应uri的sendRequest。

二。解析sendRequest函数内容，它是执行request函数（具体它的内容在src/request-css.md中讲解）。它把onRequest函数作为request的callback，即script在onload中才执行onRequest()。

三。在上述6.load执行结束以后，会一步步函数调用返回（如A调用B，B调用C，C调用D，返回的时候是D返回到C，再返回到B，最后返回A）。

四。在上述函数调用返回结束后，会执行请求回来的main.js文件，即main.js中的define(factory)。这样接下来就会执行Module.define这个函数。

五。上述define执行完毕以后，就会执行onload函数，即会执行onRequest。具体见下面详细分析

* 8. Module.define: 用于模块的定义
```javascript
Module.define = function(id, deps, factory) {
    // 参数的个数
    var argsLen = arguments.length
    // 若仅一个参数，暗示仅传入了模块的制作方法，如同：define(factory)。
    if (argsLen === 1) {
        factory = id
        id = undefined
    }
    // 若有两个参数，
    else if (argsLen === 2) {
        factory = deps
        // 且传入的第一个参数为数组，暗示传入了模块的依赖和制作方法。
        // 如同：define(deps, factory)。
        if (isArray(id)) {
            deps = id
            id = undefined
        }
        // 否则暗示传入了模块的ID和制作方法。如同：define(id, factory)
        else {
            deps = undefined
        }
    }
    // 若变量deps非数组且变量factory非函数，即define(id, factory)，设定模块的依赖。
    if (!isArray(deps) && isFunction(factory)) {
        deps = parseDependencies(factory.toString())
    }
    // 定义一个数据元
    var meta = {
        id: id,
        uri: Module.resolve(id),
        deps: deps,
        factory: factory
    }
    // 尝试在IE6-9中从匿名模块中引导出URI。
    if (!meta.uri && doc.attachEvent) {
        var script = getCurrentScript()
        if (script) {
            meta.uri = script.src
        }
        // 注意：如果上面的方法『从ID中导出URI』失败了，会降级使用
        // onload事件来取得URI。
    }
    // 发出define事件供非缓存的插件、seajs的node版本中使用。
    emit("define", meta)
    // 若数据元中的URI为空，将数据元通过URI标识存入模块中。
    // 否则，设置该匿名元为当前的数据元。
    meta.uri ? Module.save(meta.uri, meta) : anonymousMeta = meta
}
```

说明一：deps = parseDependencies(factory.toString())。这是从factory函数体中通过正则表达式匹配得到该模块的依赖项。

说明二：meta.uri ? Module.save(meta.uri, meta) : anonymousMeta = meta。如果meta.uri存在，则立即Module.save，否则就设置anonymousMeta，让其到onRequest函数中save。

* 9. onRequest函数
```javascript
// 定义请求的回调函数。
    function onRequest() {
        // 移除掉获取中列表中的URI对应的引用。
        delete fetchingList[requestUri]
        // 设置已获取列表中URI对应的值为真。
        fetchedList[requestUri] = true
        // 若匿名元非空，在模块中把它保存下来，并且清空匿名元。
        if (anonymousMeta) {
            Module.save(uri, anonymousMeta)
            anonymousMeta = null
        }
        // 清空回调列表中URI对应的所有模块，对它们进行迭代，依次调用其load方法。
        var m, mods = callbackList[requestUri]
        delete callbackList[requestUri]
        while ((m = mods.shift())) m.load()
    }
```

我们可以看到，它是先判断anonymousMeta，之后保存，也就是当前的main.js这个模块的状态已经变成了SAVED。

此后，后面又开始执行load函数（加载main.js模块的依赖项），重复上述的过程：main发现有依赖项需要执行 -> m.fetch(将sendRequest赋值，等回到load函数执行) -> 回到执行load,执行sendRequest(即request(),创建script标签，并且给script标签node绑定onload) -> 执行完load后，会一步步返回执行执行的函数 -> 前一步执行结束，执行新下载下来的spinning.js文件（即Module.define函数,发现spinning是依赖jquery的）-> 执行onRequest函数（保存spinning.js 文件的状态为SAVED,后面会执行spinning的load） -> spinning的load函数中，执行jquery模块的fetch ->   jquery的fetch结束以后，会去执行Module.define，接着执行onRequest，最后执行jquery的load -> 在执行load过程中，发现jquery此时并没有再依赖于其他的模块，所以会执行jquery的onload函数。如下：
```javascript
// 如果当前模块的所有依赖已全部加载完成，调用模块的onload方法，然后返回。
if (mod._remain === 0) {
    mod.onload()
    return
}
```

* 10. Module.prototype.onload:模块加载完成后调用的方法（终于有jquery这个模块执行onload函数了）
```javascript
Module.prototype.onload = function() {
    // 当前模块
    var mod = this
    // 设置其状态为已加载
    mod.status = STATUS.LOADED
    // 如果该模块有回调函数，调用之。
    if (mod.callback) {
        mod.callback()
    }
    // 正在等待当前模块完成的其他模块。
    var waitings = mod._waitings
    // 定义某个uri，某个模块，用于迭代。
    var uri, m
    // 迭代这些模块，依次调用等待当前模块完成的其他模块的加载完成函数onload。
    for (uri in waitings) {
        if (waitings.hasOwnProperty(uri)) {
            // 从缓存中取出迭代中当前的模块
            m = cachedMods[uri]
            m._remain -= waitings[uri]
            // 如果迭代中的当前模块的所有依赖都已加载，调用其onload方法。
            if (m._remain === 0) {
                m.onload()
            }
        }
    }
    // 内存释放
    delete mod._waitings
    delete mod._remain
}
```

说明：在jquery模块执行的过程中，它会把等待它执行完毕的模块等待数都减去1，如果减去1以后，等待的模块数变成0，那就也可以执行onload函数了。即spinning模块也开始执行onload => 等spinning模块执行onload时，发现等待的main.js模块此时也为0了，所以main.js模块也开始执行onload => main.js执行onload时候，发现最开始入口匿名模块，等待的模块数也为0，则它也开始执行onload。不过这次开始不一样了。 =>  匿名模块执行onload的时候，由上， 它会去执行mod.callback。最开始use时候定义的，具体代码如下：
```javascript
// 添加模块的回调函数。
    mod.callback = function() {
        var exports = []
        // 模块的所有依赖
        var uris = mod.resolve()
        // 迭代所有依赖，依次调用其执行方法，结果存入变量exports中。
        for (var i = 0, len = uris.length; i < len; i++) {
            exports[i] = cachedMods[uris[i]].exec()
        }
        // 若传入了回调函数，调用之，传入参数为全局变量global和变量exports。
        if (callback) {
            callback.apply(global, exports)
        }
        // 移除模块上的回调函数以释放内存。
        delete mod.callback
    }
```

说明：在执行mod.callback时候，先var uris = mod.resolve();获取匿名模块的依赖，然后执行依赖项的exec函数。等执行完所有的依赖项（执行main.js模块的exec时候，会去执行spinning的exec，再按照之前的顺着来的顺序执行exec）都执行完毕以后，会去执行当初使用use时候，指定的callback.

* 11. Module.prototype.exec: 用于模块的执行
```javascript
Module.prototype.exec = function() {
    // 当前模块
    var mod = this
    // 若模块正在或已经执行完毕，直接返回模块的输出以防止重复、循环调用。
    if (mod.status >= STATUS.EXECUTING) {
        return mod.exports
    }
    // 设置模块的状态为正在执行中。
    mod.status = STATUS.EXECUTING
    var uri = mod.uri
    // 定义require方法。
    function require(id) {
        return Module.get(require.resolve(id)).exec()
    }
    // 添加require的resolve方法，用于剖析模块的ID。其参数为ID。
    require.resolve = function(id) {
        return Module.resolve(id, uri)
    }
    // 添加require的async方法，用于异步添加依赖。参数一为依赖的ID们，
    // 参数二为回调函数。
    require.async = function(ids, callback) {
        // 给URI加上异步和不重复的标识
        Module.use(ids, callback, uri + "_async_" + cid())
        return require
    }
    // 模块执行的工厂
    var factory = mod.factory
    // 若工厂为函数，传入参数『参数一为变量require，参数二为模块的
    // exports属性，参数三为该模块』调用之并将返回结果赋予变量exports，否则直接将其赋予变量exports。
    var exports = isFunction(factory) ? factory(require, mod.exports = {}, mod) : factory
    // 若变量exports未定义，将模块的exports属性赋给它。
    if (exports === undefined) {
        exports = mod.exports
    }
    // 若变量exports为null，且不是加载CSS文件，发出error事件，携带的数据为当前模块。
    if (exports === null && !IS_CSS_RE.test(uri)) {
        emit("error", mod)
    }
    // 去除模块的工厂引用以防止内存泄漏。
    delete mod.factory
    // 设置模块的对外输出的东西。
    mod.exports = exports
    // 设置模块的状态为执行完成。
    mod.status = STATUS.EXECUTED
    // 发出exec事件，携带的数据为当前模块。
    emit("exec", mod)
    // 返回模块最终暴露给外面的东西。
    return exports
}
```

说明一：我们在require对象上扩展了两个方法，供业务代码使用，一个是require.resolve（用于将id转成对应的uri。可能在结尾加个.js）；另一个是require.async，用于异步加载某个模块，不过一般都是同步加载，因为后面会立即使用。

说明二：在该函数执行刚开始的时候，mod.status = STATUS.EXECUTING。该函数结束的时候，mod.status = STATUS.EXECUTED。

说明三：var exports = isFunction(factory) ? factory(require, mod.exports = {}, mod) : factory。代码表明会去执行某个模块（如main.js）的具体代码(factory(require, mod.exports = {}, mod))。

不过在这个require中，做了点小动作：
```javascript
function require(id) {
    return Module.get(require.resolve(id)).exec()
}
```

即：在获取到（即require('xxx')）xxx模块的同时，会去执行xxx的exec()方法，因为这个小动作，我们我就会发现，在执行main.js中require('spinning')，去执行spinning的exec => 执行spinning的exec过程中，发现又require('jquery') => 还好在执行jquery中没有发现再require了 => 就执行完jquery的factory内源码然后返回到spinning => spinning执行完剩下的factory内的源码又返回到main => 同理又返回到匿名函数。 => 等到匿名函数的的exec执行结束，则所有的模块状态都已经到EXECUTED(最后一个状态).  => oh, yes，终于结束了结束了！！！  =>   返回到mod.callback执行use中指定的callback  => 整个过程结束.





