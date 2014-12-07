####加载器的配置
它主要的目的是做一些全局配置，如alias/base等。具体代码解析见下：
```javascript
// 正则，表示以一到多个的(非贪婪)字符加一个『斜杠』打头，后面跟着两个可有可无的
// 问号，再跟着一到多个字符串『seajs/』。
// (.+?)可以用来预防贪婪匹配。
var BASE_RE = /^(.+?\/)(\?\?)?(seajs\/)+/
// 添加全局变量data的base属性，其值为加载器目录的根路径或者直接为加载
// 器的目录。用于方法id2Uri的解析。例如：如果加载器的URI是
// 『http://test.com/libs/seajs/[??][seajs/1.2.3/]sea.js』，
// 则基URI(即data.base)值为『http://test.com/libs/』。
data.base = (loaderDir.match(BASE_RE) || ["", loaderDir])[1]
// 加载器的所在目录。
data.dir = loaderDir
// 当前工作目录(如hello.html所在的目录)
data.cwd = cwd
// 文件请求的字符编码
data.charset = "utf-8"
// 预加载的模块，亦插件。可以通过两种方式：1.放在引入seajs的url中；2.放在cookie 中
data.preload = (function() {
    // 预定义好最终要返回的插件数组为空。
    var plugins = []
    // 将字符串『seajs-xxx』转换为『seajs-xxx=1』。
    // 而我们在HTML文档的URI或Cookie中使用字符串『seajs-xxx=1』来预加
    // 载插件『seajs-xxx』。
    var str = loc.search.replace(/(seajs-\w+)(&|$)/g, "$1=1$2")
    // 添加上cookie字符串。
    str += " " + doc.cookie
    // 排除掉『seajs-xxx=0』的情况，把『seajs-xxx=1』的模块(插件)添入
    // 到最终要返回的插件数组中。
    str.replace(/(seajs-\w+)=1/g, function(m, name) {
        plugins.push(name)
    })
    // 最终返回插件数组。
    return plugins
})()

// data.alias - 一个容纳模块ID的别名的对象。
// data.paths - 一个容纳模块ID中的路径简谓的对象。
// data.vars - 模块ID中的{xxx}变量。
// data.map - 一个容纳模块URI映射关系的数组。
// data.debug - 调试模式。默认值为假，即非调试模式。

// 定义seajs的config方法，传入的参数为能配置的数据configData。最后我们需要把默认配置（data中）改成用户指定配置，仍然放置到data 中
seajs.config = function(configData) {
    // 对传入的配置数据所有属性迭代，『key』为属性名。
    for (var key in configData) {
        // 现有的配置值从传入的配置数据中取出。（用户指定配置）
        var curr = configData[key]
        // 原有的配置值从全局变量data中取出。（默认配置）
        var prev = data[key]
        // 若原配置值存在且为对象，再对该对象(例如：alias，vars)进行覆盖且合并。
        if (prev && isObject(prev)) {
            for (var k in curr) {
                prev[k] = curr[k]
            }
        }
        // 否则将所有新的配置定制后存入全局对象data中。
        else {
            // 若原配置值为数组，例如：map，preload，新旧配置叠加作为
            // 新的配置。
            if (isArray(prev)) {
                curr = prev.concat(curr)
            }
            // 若配置名为『base』，则相比其他“alias”等配置来说，需要做一个额外的处理：将配置的相对路径转化为绝对路径。
            //如hello.html，配置base = "../sea-modules/"。转化以后变为："file:///Users/benlinhuo/sourcecode/sea-2.3.0/examples/sea-modules/"
            else if (key === "base") {
                // 确保base配置以斜杠结尾。
                (curr.slice(-1) === "/") || (curr += "/")
                // 确保『data.base』为绝对路径。
                curr = addBase(curr)
            }
            // 将所有新的配置存入全局对象data中。最终最终...ok
            data[key] = curr
        }
    }
    // 发出config事件，携带数据为传入的configData。
    emit("config", configData)
    // 返回全局变量seajs。
    return seajs
}
```