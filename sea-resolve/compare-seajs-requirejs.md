####本部分主要是用于说明seajs和requirejs在使用上的不同

1. 模块的依赖声明。requirejs有两种方式，seajs只支持第二种方式。
```javascript
方式一：dependencies 声明的依赖模块，会在 factory 调用时作为参数传递，顺序一致
define(['conf', 'ui'],function (conf, ui) {
        function init() {
            ui.conf(conf);
            ui.init();
        }
        return init;
    }
);

方式二：这种方式，它的依赖模块是通过函数体进行正则匹配获取，seajs只支持如下方式。理论上这种方式的性能消耗会比较大，不过在上线之前，我们会打包合并成上述方式一，所以开发环境方式二写法无所谓的。
define(function (require) {
        function init() {
            var ui = require('ui');
            ui.conf(require('conf'));
            ui.init();
        }
        return init;
    }
);
```
2. 