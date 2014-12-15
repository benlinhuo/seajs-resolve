requirejs源码解读笔记

1. 可见，如果我们未重新定义require，则require == req
if (!require) {
   require = req;
}
