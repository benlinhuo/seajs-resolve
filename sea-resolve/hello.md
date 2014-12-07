####hello 案例解析
hello.html中对seajs(我们直接查看sea-debug.js即可，合并后的)使用的代码
```javascript
<script src="../sea-modules/seajs/seajs/2.2.0/sea-debug.js"></script>

seajs.config({
    base: "../sea-modules/",
    alias: {
      "jquery": "jquery/jquery/1.10.1/jquery.js"
    }
  });

seajs.use("../static/hello/src/main");

```
即我们后面需要对该案例，解析seajs的config，和seajs的use。不过这两个基本已经可以覆盖seajs的大部分功能（尤其解析module.js这个模块）。

1. 第一步骤
其实在我们载入sea-debug.js这个文件以后，它是会去执行sea-debug.js这个文件的代码。
                
sea-debug.js这是个自定义执行函数，在内部，会有很多给data的赋值，便于后面的使用，总结如下：
```javascript
var data = seajs.data = {}
var events = data.events = {}

var BASE_RE = /^(.+?\/)(\?\?)?(seajs\/)+/

// The root path to use for id2uri parsing
// If loaderUri is `http://test.com/libs/seajs/[??][seajs/1.2.3/]sea.js`, the
// baseUri should be `http://test.com/libs/`
data.base = (loaderDir.match(BASE_RE) || ["", loaderDir])[1]

// The loader directory（script标签加载seajs的目录，意外的情况可能是工作目录）
//对于hello.html，
// data.base == "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/"
// data.dir == "file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/seajs/seajs/2.2.0/"
data.dir = loaderDir

// The current working directory（工作目录）
data.cwd = cwd

// The charset for requesting files
data.charset = "utf-8"

// Modules that are needed to load before all other modules
//预先加载的seajs插件。两种方式：1.放在引入seajs的url中；2.放在cookie 中
data.preload = (function() {
  var plugins = []

  // Convert `seajs-xxx` to `seajs-xxx=1`
  // NOTE: use `seajs-xxx=1` flag in uri or cookie to preload `seajs-xxx`
  var str = location.search.replace(/(seajs-\w+)(&|$)/g, "$1=1$2")

  // Add cookie string
  str += " " + doc.cookie

  // Exclude seajs-xxx=0
  str.replace(/(seajs-\w+)=1/g, function(m, name) {
    plugins.push(name)
  })

  return plugins
})()
```
其中的data.base等获取的值，具体见src/util-path.md中代码的解析

2. 第二步骤
执行seajs.config，目的是外部的配置覆盖之前的默认配置，具体代码解析，查看src/config.md。

3. 第三步骤（重点，精华）
seajs.use("../static/hello/src/main");执行的过程，便是module.js需要解决的问题。具体查看src/module.md 的详细讲解。
