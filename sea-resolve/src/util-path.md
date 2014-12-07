####util-path.js主要用于处理文件路径（ID，URI）

1. 文件后缀自动添加规则:
可以通过normalize()函数的解析规则获得。即：除非在路径中有问号？或者是＃，又或者最后一个字符是斜杠/，再者已经有.css或者.js后缀了。这些情况外所有的路径最后都会默认加上后缀.js。所以css文件的话就一定需要自己加上后缀.css，或者如果我们不愿意在默认最后加上.js。则我们可以手动最后加上字符#.

2. 载入sea.js文件：
var loaderScript = doc.getElementById("seajsnode") || scripts[scripts.length - 1]。通过以上该代码，可以看出，我们引入可以通过seajsnode这个id，或者把它作为最后一个scripts标签。如：
```javascript
方案一：
<script src="../sea-modules/seajs/seajs/2.2.0/sea-debug.js" id="seajsnode"></script>
方案二：
该script标签在所有script标签的最后
```

3. 以下是关于代码的解析
```javascript
// 表示非符号?或者#的其他任意字符（有0或者多个），再加上符号/。就构成了验证文件夹（目录）的正则
var DIRNAME_RE = /[^?#]*\//

// \/\.\/ 表示字符串/./，全局匹配当前路径的正则
var DOT_RE = /\/\.\//g

// 表示: 斜杠,一到多个非斜杠字符,斜杠,两点,斜杠
// 例如: /abc/../
// \/ 表示斜杠, [^/]+ 表示一到多个的非斜杠字符, \/\.\.\/ 表示/../。即这是一个关于双点(代表上一级路径)的正则表达式
var DOUBLE_DOT_RE = /\/[^/]+\/\.\.\//

// 从路径中提取出文件所在目录
// 如: dirname("a/b/c.js?t=123#xx/zz") 得到 "a/b/"
function dirname(path) {
    // 由于这里的正则表达式没有g, 返回数组的第一个元素, 即匹配到的文本.
    return path.match(DIRNAME_RE)[0]
}

// 对一个路径进行规范化. 例如:
// realpath("http://test.com/a//./b/../c") 得到 "http://test.com/a/c"
function realpath(path) {
    // 将斜杠点斜杠替换为斜杠, 对当前路径的表述进行规范化. 如:
    // /a/b/./c/./d 成为 /a/b/c/d
    path = path.replace(DOT_RE, "/")
    // 迭代地将斜杠-非斜杠字符-斜杠-点点-斜杠 替换成斜杠, 例如:
    // a/b/c/../../d  ==>  a/b/../d  ==>  a/d
    while (path.match(DOUBLE_DOT_RE)) {
        path = path.replace(DOUBLE_DOT_RE, "/")
    }
    return path
}

// 将ID正常化, 如:
// normalize("path/to/a") 变为 "path/to/a.js"
// 注意: 使用substring要比逆向slice和正则快.
function normalize(path) {
    // 最后一个字符的index.
    var last = path.length -1
    // 最后一个字符
    var lastC = path.charAt(last)
    // 如果uri中包含有井号, 直接取井号前的字符串
    if (lastC === "#") {
        return path.substring(0, last)
    }
    // 如果path已经是点js结尾, 或者含有问号, 或者点css结尾, 或者以斜杠结尾.
    // 直接返回path, 否则的话, 加上点js后返回.
    return (path.substring(last - 2) === ".js" ||
        path.indexOf("?") > 0 ||
        path.substring(last - 3) === ".css" ||
        lastC === "/") ? path: path + ".js"
}

// [^/:]+ 表示一个或多个非斜杠非冒号的字符.
// \/.+ 表示斜杠加一或多个字符
// 全部的正则表达式表示以一个或多个非斜杠非冒号的字符打头, 以斜杠加一或多个字符结尾. 例如:
// abc/def/asdf/asdf
var PATHS_RE = /^([^/:]+)(\/.+)$/

// 正则表达式, 全局匹配一对大括弧包含某几个字符
// [^{]+ 表示一个或多个非左大括弧的字符
var VARS_RE = /{([^{]+)}/g

// 对ID进行别名解析
function parseAlias(id) {
    // 取出data的alias属性, 这里data是全局对象seajs的一个属性
    var alias = data.alias
    // 如果data的alias属性存在并且id是已经定义好的别名, 返回别名指向的真正东西.
    // 否则直接返回传入的id
    return alias && isString(alias[id]) ? alias[id] : id
}

// 对路径id进行解析
function parsePaths(id) {
    // 取出data的paths属性, 这里data是全局对象seajs的一个属性
    var paths = data.paths
    var m
    // 如果paths存在并且传入的路径是符合正常路径的定义, 并且匹配到的第一组, 也就是路径的
    // 首段(第一个斜杠前的东西)是字符串的话, 把匹配到的第一组(也就是路径的首段, 第一个斜杠前的字符串)
    // 与匹配到的第二组连接(余下的匹配), 返回.
    // 否则的话, 直接返回传入的路径
    if (paths && (m = id.match(PATHS_RE)) && isString(paths[m[1]])) {
        id = paths[m[1]] + m[2]
    }
    return id
}

// 对变量表达式进行解析
// 例如: 如果seajs.data.vars.name等于Justin, 那么,
// "My name is {name}." 解析成 "My name is Justin."
function parseVars(id) {
    // 取出data的vars属性, 这里data是全局对象seajs的一个属性
    var vars = data.vars
    // 如果vars已定义并且传入的变量表达式含有左花括弧, 将大括弧所包裹的字符串(例如是"name")替换成:
    // 1) 如果vars中有关于该字符串(例如是"name")的mapping并且值是字符串, 替换成它的mapping.
    // 2) 否则的话, 替换成传入的变量表达式, 相当于没有改变
    // 否则的话, 直接返回传入的变量表达式, 也相当于没有改变
    if (vars && id.indexOf("{") > -1) {
        // NOTE: 这里的replace方法的第二个参数如果是函数并且寻找匹配成功的话, 函数的第一个参数是匹配
        // 到的字符串, 函数的后几个参数的值分以下几种情况:
        // 1) 如果replace方法的第一个参数是字符串(例如'name')或者未分组的正则表达式的话, 函数的第二个
        // 参数是字符串或正则内容(例如'name')在replace方法的调用者(caller)的匹配到的index, 第三个参数
        // 是replace方法的调用者(caller).
        // 2) 如果replace方法的第一个参数是有分组的正则表达式的话, 函数的第二个参数是匹配到的分组对应的
        // 字符串, 第三个参数是字符串(例如'name')在replace方法的调用者(caller)的匹配到的index, 第四个
        // 参数是replace方法的调用者(caller).
        // 如果匹配未成功, 函数只有一个参数, 即replace方法的调用者(caller)自身
        id = id.replace(VARS_RE, function(m, key) {
            return isString(vars[key]) ? vars[key] : m
        })
    }
    return id
}

// 对变量uri中有map关系的字符进行解析,替换
function parseMap(uri) {
    // 取出data的map属性, 这里data是全局对象seajs的一个属性
    var map = data.map
    // 定义返回的变量ret, 初始化为传入的uri
    var ret = uri
    // 如果map存在
    if (map) {
        // 迭代map
        for (var i = 0; len = map.length; i < len; i++) {
            // 定义变量rule为当前循还取到的东西
            var rule = map[i]
            // 如果变量rule为函数, 把变量uri传给函数rule并调用, 如果调用返回结果为真值, 返回值传给变量ret; 
            //     如果调用返回结果为假值, 把变量uri传给变量ret.
            // 如果变量rule不是函数, 调用变量uri的replace方法, 把变量uri中含有等于变量rule的第一个参数的
            //     字符替换成变量rule的第二个元素, 最终将replace方法的返回值传给变量ret.
            ret = isFunction(rule) ? (rule(uri) || uri) : uri.replace(rule[0], rule[1])
            // 如果变量ret不全等于变量uri, 表明ret的值已经更新了,不再是初始值, 目的达成, 可以跳出循环
            if (ret !== uri) break
        }
    }
    // 最后返回变量ret.
    return ret
}

// 正则表达式, 表示(双斜杠开头加一个字符)或者(一个冒号加斜杠)
var ABSOLUTE_RE = /^\/\/.|:\//

// 正则表达式, 表示非贪婪匹配以零到多个字符打头, 加两斜杠加非贪婪匹配零到多个字符再加斜杠, 
// 例如: ab//c/
// 用来判断根目录
var ROOT_DIR_RE = /^.*?\/\/.*?\//

// 添加路径的基地
function addBase(id, refUri) {
    // 定义变量ret为最终要返回的东西.
    var ret
    // 传入的变量id的第一个字符
    var first = id.charAt(0)
    // 如果传入的变量id是一个绝对路径, 返回值为变量id
    if (ABSOLUTE_RE.test(id)) {
        ret = id
    }
    // 如果变量id的第一个字符为点, 表明为相对路径,
    else if (first === ".") {
        // 再判断是否传入变量refUri, 如果是的话, 取得它的所在的目录, 否则的话, 取出data(这里data是
        // 全局对象seajs的一个属性)的cwd(当前的工做目录)属性, 最后拼上变量id, 作为参数传给
        // 函数realpath, 进行规范化后赋予变量ret.
        ret = realpath((refUri ? dirname(refUri) : data.cwd) + id)
    }
    // 如果变量id的第一个字符为斜杠, 表明是根路径
    else if (first === "/") {
        // 定义变量m, 赋值为是否data的当前工作目录为根目录
        var m = data.cwd.match(ROOT_DIR_RE)
        // 如果是的话, 返回值为正则匹配到的文本连接上(去除掉第一个字符(也就是斜杠)的)变量id, 
        // 否则的话, 返回值为变量id.
        ret = m ? m[0] + id.substring(1) : id
    }
    // 其它情况的话, 返回值为data(这里data是全局对象seajs的一个属性)的属性base连接上变量id.
    else {
        ret = data.base + id
    }
    // 返回返回值
    return ret
}

// 将id转化为uri
// 此处的id一般而言是相对于data.base而言的。不过也可能是其他情况（具体见下代码addBase）
function id2Uri(id, refUri) {
    // 如果未传入id, 或传入id未空, 假值, 直接返回空字符串.
    if (!id) return ""
    // 首先查看是否为别名, 取得对应的路径
    id = parseAlias(id)
    // 其次查看是否为路径
    id = parsePaths(id)
    // 再次查看是否含有未解决(替换)的变量表达式, 如有, 解决(替换)之.
    id = parseVars(id)
    // 再将之正常化(补上文件名后缀)
    id = normalize(id)
    // 然后再添加上路径前段的基(base), 使之成为完整路径
    var uri = addBase(id, refUri)
    // 再对有map关系的字符进行解析替换
    uri = parseMap(uri)
    // 最终返回.
    return uri
}

// 变量document的引用
var doc = document
// 变量location的引用
var loc = location
// 通过页面的路径得到当前工作目录
var cwd = dirname(loc.href)
// 页面上所有的脚本引用列表
var scripts = doc.getElementsByTagName("script")

// 定义脚本加载器, 首先考虑ID名为seajsnode的HTML元素, 如果没有, 使用最后一个脚本作为加载器.
// 推荐用户给引用seajs的脚本元素加上ID名为seajsnode
var loaderScript = doc.getElementById("seajsnode") ||
    scripts[scripts.length - 1]

// 定义加载器所在目录, 如果seajs不是通过外部引用进来的, 也就是说是行内形式, 则加载器所在目录
// 为当前工作目录.
//dirname(getScriptAbsoluteSrc(loaderScript)返回的是我们通过script标签引入seajs的目录，cwd是当前hello.html的当前目录。
//所以一般而言,data.base＝data.dir指的是script标签上对应的文件目录
var loaderDir = dirname(getScriptAbsoluteSrc(loaderScript) || cwd)

// 一个帮助函数, 用于从传入的HTML标签节点中取出脚本的源文件绝对路径.
function getScriptAbsoluteSrc(node) {
    // 如果非IE6/7, 使用节点的src属性, 否则
    // 参考 http://msdn.microsoft.com/en-us/library/ms536429(VS.85).aspx, 
    // 使用节点的getAttribute方法得到源文件的绝对路径.
    return node.hasAttribute ? node.src : node.getAttribute("src", 4)
}
```
