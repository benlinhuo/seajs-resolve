##总结
总结的部分主要以主题或者问题的形式

####总结一. 
关于函数function id2Uri(id, refUri){}在seajs中的应用形式：
1. 直接赋值给seajs.resolve。这样我们就可以直接将一个相对于base的模块id转换成对应的uri（其实就是完整的文件路径）。如id = "../static/hello/src/main",转化后的uri = "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/static/hello/src/main.js".
```javascript
// For Developers
seajs.resolve = id2Uri
```

2. 利用seajs.resolve创建Module.resolve。其实作用还是一样的就是将id转成uri，不过在seajs.resolve基础上做了一层封装而已。
```javascript
// Resolve id to uri
Module.resolve = function(id, refUri) {
  // Emit `resolve` event for plugins such as text plugin
  var emitData = { id: id, refUri: refUri }
  emit("resolve", emitData)

  return emitData.uri || seajs.resolve(emitData.id, refUri)
}
```

3. 又在Module.resolve基础上封装Module.prototype.resolve。不过这个不是简单的id=>uri。它是将当前模块的依赖模块一个个的由id转成uri. 
```javascript
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
```

4. 这是在Module.prototype.exec中，给factory(require, exports, module)中的require扩展的方法resolve，这样我们在写业务代码的时候就可以通过require.resolve()转成对应的uri（主要目的是扩展给业务开发人员使用的）。如require.resolve('http://example.com/js/a')；会被解析成http://example.com/js/a.js
```javascript
function require(id) {
    return Module.get(require.resolve(id)).exec()
}

require.resolve = function(id) {
    return Module.resolve(id, uri)
}
```


####总结二.
一个常用的用法

我们会把一个空对象传给一个函数，该函数可能会改变这个空对象。如下：
```javascript
(function(){
    var obj = {url: 'wwww.baidu.com'};
    console.log(obj, 'before');
    test(obj);//更改了obj这个对象引用
    console.log(obj, 'after');
})();

function test(obj) {
    obj.testVal = '111111';
}
```

seajs源码中用到这种思想的有以下典型的几例：
```javascript
var emitData = { uri: uri }
emit("fetch", emitData)
//看上处定义emitData，是没有emitData.requrestUri的，为啥还要做判断呢？就是因为怕事件“fetch”会改变emitData这个对象
var requestUri = emitData.requestUri || uri
```

Module.prototype.exec中：
```javascript
var exports = isFunction(factory) ?
      factory(require, mod.exports = {}, mod) :
      factory
```
可以看到，在执行factory（ 对应define(function(require, exports, module)) ）时，我们是把mod.exports赋值给了exports.所以我们也说exports只是mod.exports的一个引用。


####总结三：

问题: 多个模块引用同一个模块，如何保证它不被请求多次（不被重复操作）？

答：1. 其实对于一个模块，我们都给予它多个状态（mod.status:FETCHING,SAVED...），在判断依赖模块是否需要请求或load时，可以通过这些状态去判断，模块现在已经是个啥状态了。如当前判断它是否已经FETCHING过了，如果是则不需要再fetch一次就可以直接进入下一个阶段。即在不同的处理阶段，会去判断它所需要的状态，如果已经完成的话，不需要当前处理就可以直接跳到下一个状态。

    2. 也因为我们给了每个模块一个生命周期，这样在因为依赖加载模块时就不会乱。

####总结四：

问题：为什么我们就直接可以通过module.exports或者exports.xxxx导出可以被外部引用的方法，exports为什么又说是module.exports的一个引用？

答：因为我们在exec函数中可以看到，在执行factory时factory(require, mod.exports = {}, mod).即把mod.exports作为define(require, exports, module)中的exports。所以我们说exports时module.exports的一个引用。
```javascript
function require(id) {
  return Module.get(require.resolve(id)).exec()
}

var exports = isFunction(factory) ?
      factory(require, mod.exports = {}, mod) :
      factory

if (exports === undefined) {
  exports = mod.exports
}

return  exports;
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

说明三：我们通过exports来暴露接口。这就意味着完全不需要命名空间，更不需要全局变量。这是一种彻底的命名冲突解决方案。原因如上代码：它会将返回的执行结果factory(...)赋值给exports.如果这样拿到的为undefined,则会默认是通过module.exports赋值给exports，最后exec返回exports.我们看require函数，它return 的就是exec的结果。所以我们使用var xxx＝require('xxx')；就可以将执行exec得到的exports结果赋值给xxx了。

####总结五：
hello.html案例执行的简单流程如下：

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
在执行onRequest函数中，有
```javascript
if (anonymousMeta) {
      Module.save(uri, anonymousMeta)
      anonymousMeta = null
    }
```
即会保存关于最新请求过来的这个uri.
在Module.save中，save的还是main.js这个模块的相关信息。
```javascript
mod.id = "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/static/hello/src/main.js"
mod.dependencies = ["./spinning"]
mod.factory = function (require) {

  var Spinning = require('./spinning');

  var s = new Spinning('#container');
  s.render();

}
mod.status = STATUS.SAVED;
```
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
```javascript
if (mod._remain === 0) {
    mod.onload()
    return
  }
```

13. 接下来就是各个模块会使用与之前相反顺序（A依赖于B，B依赖于C；相反顺序指：C－>B->A）去执行各自对应的onload函数（该函数是用于执行callback）


####总结六
描述：有时候我们是希望使用require来进行条件加载，如下：
```javascript
if (todayIsWeekend) {
    require('play');
} else {
    require('work');
}
```
从我们静态分析的角度来看，这个模块是不会区分条件的，会认为当前模块依赖于play和work这两个模块（因为在分析当前模块的依赖模块时候，是通过正则表达式去匹配的，只匹配到了require,所以这两个都会被当成依赖模块而被被请求执行。这么说，更重要的点是require是个关键字，也不能被用作其他用途，否则会被当作依赖模块来处理）。

这样的情况，我们可以通过require.async来进行条件加载，因为它不是简单的通过require关键字去匹配得到依赖模块的。看require.async的源码可知，它是通过Module.use去加载的（会生成mod.callback）。它异步的原因是，使用use，我们就只能通过传入callback来执行模块加载完毕以后的操作了。而不能直接通过return 一个结果的形式，进行后续操作。
```javascript
require.async = function(ids, callback) {
    Module.use(ids, callback, uri + "_async_" + cid())
    return require
}
```

对于有多个Module.use的情况，我们可以这么理解：有多个入口文件，它们之间就只是在加载某些公用模块的时候，有些可能已经被加载过了。如果被加载过了，更好，就不用自己再加载一次了。各自完了之后，回到自己最初出发的地方，进行后面操作即可。



























