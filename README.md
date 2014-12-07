####概述
1. 我们的seajs-resolve仓库中，解析的seajs版本是2.3.0(不过我们解析的hello.html中引用的版本是2.2.0)，我们讲解的源码还是以2.2.0为主，2.3.0与2.2.0在config.js中稍有些区别，其他没对比。在sea-2.3.0文件夹中，对应文件夹目录解析如下：
sea-2.3.0
  |- examples  --使用seajs的几个常用例子
     |- app  --html文件夹（包括四个例子：hello.html等，因为我们一会儿讲解seajs源码的一个流程就是hello这个小seajs）
     |- sea-modules  --项目中会用到的库，如jquery等
     |- static  --这里面也是关于各个案例的js和css代码，不过我们只关心hello
         |- hello
             |- dist (其中的*.js是已经完全压缩好的所有模块代码集合，上线可以直接使用；*-debug.js文件是已经所有模块进行了合并且放到了一个文件中，但是还没有压缩而已)
             |- src (这是业务代码，以模块划分成一个个文件，用于我们开发，以及线下调试用的)
     |- test

  |- seajs-2.3.0  --关于seajs的源码
     |- dist  --sea.js等压缩好的文件，直接可以使用
     |- docs  --seajs使用文档 
     |- lib  --给nodejs用的版本
     |- src  --seajs最初始的源码
     |- test  --测试集
     |- Makefile  --可执行构建、测试等命令 

2. 对于上述的目录结构，我们解析seajs源码，需要用到seajs-2.3.0/src以及一个案例代码hello
对于seajs-2.3.0/src目录结构如下：
.../src
      |- intro.js
      |- sea.js
      |- util-lang.js
      |- util-events.js
      |- util-path.js
      |- util-request.js
      |- util-deps.js
      |- module.js
      |- config.js
      |- outro.js

以上src中的所有文件，组合以后就变成了seajs-2.3.0/dist/sea-debug.js文件。
intro.js和outro.js相当于是整个源码的一个包装器（Wrapper），如下：
```javascript
(function(global, undefined) {
    // 如果seajs已经加载了, 不再重复加载.
    if (global.seajs) {
        return;
    }
    // ... Source codes are going here.
})(this);
```

对于整体的介绍，我们就到此，后面会以hello这个案例解析源码的执行过程。此外，我们还会对案例解析过程中没涉及到的点进行以问题或者其他方式解析。敬请期待！

其中的module.js是核心模块，用于解析模块加载先后顺序以及依赖等内容。

此处也顺便把sea.js解析了：
```javascript
// 定义seajs变量, 并赋予为全局变量global的属性seajs.
var seajs = global.seajs = {
    // 这里是定义seajs的版本号的地方.它将通过build工具(如grunt)被替换成在package.json文件中定义的真实的版本号.
    version: "@VERSION"
}
// 定义变量data为一个空对象, 并赋予为变量seajs的data属性.
var data = seajs.data = {}
```

针对以上的目录，我们建议的阅读顺序（也是最后组成sea-debug.js的顺序）是：intro.js => sea.js => util-lang.js => util-events.js => util.path.js => util.request-css.js => util-deps.js => module.js => config.js => outro.js

seajs.use()。它主要是用于开启某一个模块的使用，实际上就是使用之前define的一个模块，且不需要被其他模块调用，即相当于定义一个匿名模块define()。
各个模块之间都互相依赖，总是需要一个领头羊牵着，才能开始后面的奔跑。该匿名模块，其实在seajs源码里面是自动帮其生成了一个uri（即名字），
然后该匿名模块指定需要执行的模块就作为该匿名模块的依赖模块处理。


