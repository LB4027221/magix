/**
 * @fileOverview Magix全局对象
 * @author 行列<xinglie.lkf@taobao.com>
 * @version 1.0
 **/
KISSY.add('magix/magix',function(S){
	var Slice=[].slice;
    var Slash='/';
	var Include=function(path){
		var magixPackages=S.Config.packages.magix;
        var mPath=magixPackages.base||magixPackages.path;

        var url = mPath+path + ".js?r=" + Math.random()+'.js';
        var xhr = window.ActiveXObject || window.XMLHttpRequest;
        var r = new xhr('Microsoft.XMLHTTP');
        r.open('GET', url, false);
        r.send(null);
        return r.responseText;
	};
    eval(Include('../tmpl/magix'));
    return mix(Magix,{
        include:Include,
        libRequire:function(name,fn){
            if(name){
                var isFn=S.isFunction(fn);
                var isArr=S.isArray(name);

                S.use(isArr?name.join(','):name,isFn?function(S){
                    fn.apply(S,Slice.call(arguments,1));
                }:S.noop);
            }else{
                fn();
            }
        },
        libEnv:function(cfg){
            var me=this;
            var appHome=cfg.appHome;
            var loc=location;
            var protocol=loc.protocol;
            var appName=cfg.appName;

            if(!~appHome.indexOf(protocol)){
                appHome=me.path(loc.href,appHome);
            }

            if(!S.endsWith(appHome,Slash)){
                appHome+=Slash;
            }
            cfg.appHome=appHome;
            var debug=cfg.debug;
            if(debug){
                debug=appHome.indexOf(protocol+'//'+loc.host)==0;
            }
            if(appName.charAt(0)=='~'){
                var reg=new RegExp(Slash+appName+Slash);
                S.config({
                    map:[[reg,Slash]]
                });
            }
            var appTag='';
            if(debug){
                appTag=S.now();
            }else{
                appTag=cfg.appTag;
            }
            if(appTag){
                appTag+='.js';
            }
            var appCombine=cfg.appCombine;
            if(S.isUndefined(appCombine)){
                appCombine=S.config('combine');
            }
            S.config({
                packages:[{
                    name:appName,
                    path:appHome,
                    debug:cfg.debug=debug,
                    combine:appCombine,
                    tag:appTag
                }]
            });
        },
        isArray:S.isArray,
        isFunction:S.isFunction,
        isObject:S.isObject,
        isRegExp:S.isRegExp,
        isString:S.isString,
        isNumber:S.isNumber
    });
});