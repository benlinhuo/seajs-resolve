####util-request.js 请求加载js脚本和css样式文件

原理：直接看函数request(url, callback, charset).它是创建script或者link标签，然后设置异步等属性，插入到文档流中，便可以开始请求。同时addOnload中有：node.onload = node.onerror = node.onreadystatechange = function(){//在onload中，它调用了callback，即module中的onRequest}。 

我们需要知道一个js异步执行的顺序问题：

增加一个知识点总结：
当我们正在执行js部分A，突然是通过js创建了一个script标签，并进行了请求，且设置了onload函数C。我们认为请求回来的js代码为B。
等待js代码请求回来以后的执行顺序：
1. 请求回来的任何东西都会等待当前需要执行的A部分代码结束（即不干扰正在执行的流程）。
2. 之后会先去执行请求回来的js代码B
3. B结束以后才会执行onload函数C

代码解析：
```javascript
// 定义DOM文档的头部引用, 使用标准方法获取, 如果不存在, 使用文档元素替代
var head = doc.getElementsByTagName("head")[0] || doc.documentElement
// 定义变量baseElement为DOM头部的base标签.
var baseElement = head.getElementsByTagName("base")[0]

// 正则, 表示不区分大小写, (以点css结尾)或者(点css加一个问号)的文本,
var IS_CSS_RE = /\.css(?:\?|$)/i
// 正则, 完全匹配字符loaded或completed或undefined
var READY_STATE_RE = /^(?:loaded|complete|undefined)$/

// 定义变量表示当前正在添加的脚本
var currentlyAddingScript
// 定义变量表示正在交互的脚本
var interactiveScript

// 在WebKit小于535.23和Firefox小于9.0的版本中不支持事件onload
// 参考:
//  - https://bugs.webkit.org/show_activity.cgi?id=38995
//  - https://bugzilla.mozilla.org/show_bug.cgi?id=185236
//  - https://developer.mozilla.org/en/HTML/Element/link#Stylesheet_load_events
var isOldWebKit = (navigator.userAgent.replace(/.*AppleWebKit\/(\d+)\..*/, "$1")) * 1 < 536

// 定义函数request, 参数分别为
// - url : 请求对象的URL地址
// - callback : 回调函数
// - charset : 字符编码
function request(url, callback, charset) {
    // 定义变量isCSS为是否传入的url为CSS
    var isCSS = IS_CSS_RE.test(url)
    // 根据isCSS判断不同来新生成为link或者script节点
    var node = doc.createElement(isCSS ? "link" : "script")
    // 如果有传入charset且为真值(truy)
    if (charset) {
        // 如果传入的charset是一个函数, 将url传给函数charset并调用, 结
        // 果赋值给变量cs; 否则, 直接赋值给变量cs
        var cs = isFunction(charset) ? charset(url) : charset
        // 如果变量cs存在.
        if (cs) {
            // 设置节点的字符编码为cs
            node.charset = cs
        }
    }
    // 调用函数addOnload, 传入参数.
    addOnload(node, callback, isCSS)
    // 如果请求是CSS文件
    if (isCSS) {
        // 设置节点的rel和href属性
        node.rel = "stylesheet"
        node.href = url
    } else {
        // 否则为JS文件, 设置节点的async属性为真, src属性为传入的url.
        node.async = true
        node.src = url
    }
    // 由于在IE6至8中某些缓存问题, JS脚本会在插入后立马执行. 因此, 使
    // 用变量currentlyAddingScript来保持当前节点的引用, 在define调用中
    // 导出url.
    currentlyAddingScript = node
    // 参见: #185 和 http://dev.jquery.com/ticket/2709
    // 如果变量baseElement存在, 将node节点插入到baseElement节点之前, 否则
    // 将node节点直接放置到DOM头部内的最后一个元素.
    baseElement ? head.insertBefore(node, baseElement) : head.appendChild(node)
    // 清空变量currentlyAddingScript的引用.
    currentlyAddingScript = null
}

// 定义函数addOnload, 参数一: node表节点, 参数二: callback表回调函数,
// 参数三: isCSS判断是否CSS文件
function addOnload(node, callback, isCSS) {
    // 当请求对象为CSS文件并且(浏览器是老的WebKit引擎或者节点中无
    // onload属性)时, 定义变量missingOnload为真, 否则为假.
    var missingOnload = isCSS && (isOldWebKit || !("onload" in node))
    // 当变量missingOnload为真时, 延时一毫秒去拉取CSS. 函数返回.
    if (missingOnload) {
        setTimeout(function() {
            pollCss(node, callback)
        }, 1) // Begin after node insertion
        return
    }
    // 设置节点的load和error和readystatechange事件的监听器.
    node.onload = node.onerror = node.onreadystatechange = function() {
        // 如果节点的加载状态是loaded或complete或undefined的话,
        if (READY_STATE_RE.test(node.readyState)) {
            // 清空已有的监听器, 防止在IE中内存泄漏
            node.onload = node.onerror = node.onreadystatechange = null
            // 如果非CSS文件(即脚本文件)并且非调试环境, 从页面文档的头
            // 部中移除该节点.
            if (!isCSS && !data.debug) {
                head.removeChild(node)
            }
            // 解除节点的引用
            node = null
            // 触发回调函数
            callback()
        }
    }
}

// 定义函数pollCss, 参数一: node表示节点, 参数二callback表示回调函数.
function pollCss(node, callback) {
    // 定义变量sheet为节点的sheet属性.
    var sheet = node.sheet
    // 判断是否已加载的标记
    var isLoaded
    // 如果是版本小于536的WebKit浏览器时,
    if (isOldWebKit) {
        // 如果节点的sheet属性存在的话,
        if (sheet) {
            // 设置标记为真, 表示已经加载.
            isLoaded = true
        }
    }
    // 如果是版本低于9.0的Firefox
    else if (sheet) {
        try {
            // 尝试判断是否存在cssRules属性, 是的话,表明已经加载过了.
            if(sheet.cssRules){
                isLoaded = true
            }
        } catch (ex) {
            // 如果发生异常, 且异常名为NS_ERROR_DOM_SECURITY_ERR的话,
            if (ex.name === "NS_ERROR_DOM_SECURITY_ERR") {
                // 设置标记为真, 表明已经加载过了
                isLoaded = true
            }
        }
    }
    // 延时20毫秒去
    setTimeout(function() {
        // 如果CSS文件已加载,
        if (isLoaded) {
            // 调用回调函数, 在这调用回调函数是为了留出时间以渲染样式
            callback()
        }
        // 否则再次请求CSS文件, 直到成功
        else {
            pollCss(node, callback)
        }
    }, 20)
}

// 获取当前的脚本
function getCurrentScript() {
    // 如果正在添加脚本
    if (currentlyAddingScript) {
        // 直接返回正在添加的脚本
        return currentlyAddingScript
    }
    // 对于浏览器IE6-9, 脚本的onload事件可能不会在评估后马上发出, Kris
    // Zyp发现可以通过查询所有脚本,从中找到为interactive状态的, 即为当
    // 前的脚本. 参见: http://goo.gl/JHfFW
    // 如果交互脚本非空, 且它的readyState为interactive.
    if (interactiveScript && interactiveScript.readyState === "interactive") {
        // 直接返回该交互脚本
        return interactiveScript
    }
    // 提取出DOM中所有的脚本
    var scripts = head.getElementsByTagName("script")
    // 迭代所有脚本
    for (var i = scripts.length - 1; i >= 0; i--) {
        // 当前的脚本
        var script = scripts[i]
        // 如果当前的脚本的readyState属性为interactive
        if (script.readyState === "interactive") {
            // 设置交互脚本为当前迭代到的脚本
            interactiveScript = script
            // 返回该交互脚本
            return interactiveScript
        }
    }
}
```