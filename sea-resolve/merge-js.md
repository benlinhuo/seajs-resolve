####本部分是对我们已经通过spm,将我们的业务代码进行合并以后的，seajs执行流程

还是以hello.html为案例来讲解：

在spm进行合并以后，可以查看我们的main-debug.js文件，代码如下：
```javascript
define("examples/hello/1.0.0/main-debug", [ "./spinning-debug", "jquery-debug" ], function(require) {
    ......
});

define("examples/hello/1.0.0/spinning-debug", [ "jquery-debug" ], function(require, exports, module) {
    ......
});
```

可以看到，其实它已经把id和deps(每个模块的依赖模块)补充完整了。下面根据这个讲解主要执行流程（重点讲解与开发环境执行流程不同的地方）。

1. 我们在非开发环境下： seajs.use("examples/hello/1.0.0/main-debug");指定的main-debug.js即为上述的代码。

2. 执行Module.use()，该函数中uri="file:///Users/benlinhuo/sourcecode/sea-2

.3.0/examples/app/_use_0匿名模块，它有callback。它在执行callback的时候，又会顺序去执行". 最后会执行mod.load()。

3. 在执行mod.load过程中，需要去执行它的依赖模块uris = ["file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/examples/hello/1.0.0/main-debug.js"]。因为此时main-debug.js的模块status为0，所以需要去fetch。

4. 因此我们是需要去执行该模块的fetch函数。该函数中会去执行seajs.request()函数，即创建script标签去请求（因为之前我们是把所有的业务代码模块合并在了main-debug.js中，所以就不会出现出现多次这种请求，一次请求就会请求所有的业务模块）。

5. 等script标签的src内容请求回来以后，我们会先去执行里面的各个define函数。查看Module.define函数的实现（简化了，如下：）。因为此时，main-debug.js中的每个define的id和deps都已经补充完整了，所以看最后一行，meta.uri都是有值的，也就是说在main-debug中的每个define模块此时的状态都已经变成了SAVED（因为fetch了main-debug，则其他所有的模块都被fetch下来了，在我们执行每个define模块是又会把其状态变成SAVED）。备注：此处说把依赖模块的状态变成SAVED，是指使用define定义过的模块，像jquery只是引用了，但是都没在main-debug.js中定义，所以暂时不会去管jquery，等到后面加载jquery依赖模块时，才会去fetch。
```javascript
Module.define = function (id, deps, factory) {
  var meta = {
    id: id,
    uri: Module.resolve(id),
    deps: deps,
    factory: factory
  }

  // Emit `define` event, used in nocache plugin, seajs node version etc
  emit("define", meta)

  meta.uri ? Module.save(meta.uri, meta) :
      // Save information for "saving" work in the script onload event
      anonymousMeta = meta
}
```

7. 等到所有define函数结束后，main和spinning这两个模块的status均为SAVED。即所有业务代码的define执行结束以后，会去执行onRequest（是script的onload事件，代码是简化了的）。此时requestUri="file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/examples/hello/1.0.0/main-debug.js" 。以下mods的uri即为main-debug。所以后面会去执行m.load()。即main-debug的load。
```javascript
function onRequest() {
    delete fetchingList[requestUri]
    fetchedList[requestUri] = true

    // Call callbacks
    var m, mods = callbackList[requestUri]
    delete callbackList[requestUri]
    while ((m = mods.shift())) m.load()
  }
```

8. 执行上述的load。此时main-debug依赖于两个模块spinning和jquery.spinning因为status已经为SAVED了，所以不会执行：m._waitings[mod.uri] = (m._waitings[mod.uri] || 0) + 1。接下来，// Begin parallel loading时候，我们发现spinning的status已经为SAVED了，所以m.load()，即会去执行spinning的依赖模块jquery。jquery会去经历fetch->saved的过程。因为jquery不再依赖于任何模块，所以它再执行load()时候，会去执行onload(用于执行callback，jquery模块没有callback)。
 
返回到spinning的依赖模块load执行，因为它的依赖模块也执行完毕，所以会去执行onload（也没有callback）。
 
再返回到main-debug的load，因为它的依赖spinning和jquery都已经执行结束，所以它也会去执行onload（没有callback，只有use的匿名模块才有）...

接下来，就会执行最开始的_use_0匿名模块，它有callback。它在执行callback的时候，又会顺序去执行main-debug  spinning jquery的exec。之后就如线下执行一样了。

备注：其实我们可以发现，因为spinning被集成到main-debug中了，所以我们按照spinning的uri查找该文件并不存在，但是我们无需在意，因为它的文件内容在main-debug中，我们只需要把"examples/hello/1.0.0/spinning-debug"作为一个key值就好了。
