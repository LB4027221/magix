/**
 * @fileOverview model管理工厂，可方便的对Model进行缓存和更新
 * @author 行列
 * @version 1.0
 **/
KISSY.add("mxext/mmanager",function(S,Magix,Event){
    var Has=Magix.has;
    var SafeExec=Magix.safeExec;
    var DeleteCacheKey=function(modelsAttr){
        if(!S.isArray(modelsAttr)){
            modelsAttr=[modelsAttr];
        }
        for(var i=0,m;i<modelsAttr.length;i++){
            m=modelsAttr[i];
            delete m.cacheKey;
        }
        return modelsAttr;
    };
    /**
     * Model管理对象，可方便的对Model进行缓存和更新
     * @name MManager
     * @class
     * @namespace
     * @param {Model} modelClass Model类
     */
    var MManager=function(modelClass){
        var me=this;
        me.$mClass=modelClass;
        me.$mCache=Magix.createCache();
        me.$mCacheKeys={};
        me.$mMetas={};
    };

    var Slice=[].slice;
    var WhiteList={
        urlParams:1,
        postParams:1,
        cacheKey:1,
        cacheTime:1,
        before:1,
        after:1
    };
    var GetOptions=function(obj){
        var r={};
        for(var p in obj){
            if(!WhiteList[p]){
                r[p]=obj[p];
            }
        }
        return r;
    };
    var WrapDone=function(fn,context){
        var a = Slice.call(arguments, 2);
        return function(){
            return fn.apply(context,a.concat(Slice.call(arguments)));
        }
    };
    Magix.mix(MManager,{
        /**
         * @lends MManager
         */
        /**
         * 创建Model类管理对象
         * @param {Model} modelClass Model类
         */
        create:function(modelClass){
            var me=this;
            if(!modelClass){
                throw new Error('MManager.create:modelClass ungiven');
            }
            return new MManager(modelClass);
        }
    });
    var FetchFlags={
        ALL:1,
        ONE:2,
        ORDER:4
    };
    /**
     * model请求类
     * @name MRequest
     * @class
     * @namespace
     * @param {MManager} host
     */
    var MRequest=function(host){
        this.$host=host;
        this.$doTask=false;
        this.$reqModels={};
    };

    var BEFORE='_before';
    var AFTER='_after';

    Magix.mix(MRequest.prototype,{
        /**
         * @lends MRequest#
         */
        /**
         * 获取models，该用缓存的用缓存，该发起请求的请求
         * @private
         * @param {Object|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2},params:[]}
         * @param {Function} done   完成时的回调
         * @param {Integer} flag   获取哪种类型的models
         * @return {MRequest}
         */
        fetchModels:function(models,done,flag){
            var me=this;
            if(me.$doTask){
                me.next(function(request){
                    request.fetchModels(models,done,flag);
                });
                return me;
            }
            me.$doTask=true;

            var host=me.$host;
            var modelsCache=host.$mCache;
            var modelsCacheKeys=host.$mCacheKeys;
            var reqModels=me.$reqModels;

            if(!S.isArray(models)){
                models=[models];
            }
            var total=models.length;
            var current=0;
            var errorMsg;
            var hasError;

            var doneArr=new Array(total);
            var doneArgs=[];
            var errorArgs={};
            var orderlyArr=[];

            var doneIsArray=S.isArray(done);
            if(doneIsArray){
                doneArgs=new Array(done.length);
            }
            var doneFn=function(idx,isFail,model,args){
                console.log(me.$destroy,idx,isFail,model,args);
                if(me.$destroy)return;//销毁，啥也不做
                current++;
                delete reqModels[model.id];
                var cacheKey=model._cacheKey;
                doneArr[idx]=model;
                if(isFail){
                    hasError=true;
                    errorMsg=args||errorMsg;
                    errorArgs[idx]=args;
                }else{

                    model._doneAt=S.now();
                    if(cacheKey&&!modelsCache.has(cacheKey)){
                        modelsCache.set(cacheKey,model);
                        var after=model._after;
                        var meta=model._meta;

                        if(after){//有after
                            SafeExec(after,[model,meta]);
                        }
                        host.fireAfter(meta.name,[model]);
                    }
                }               

                if(flag==FetchFlags.ONE){//如果是其中一个成功，则每次成功回调一次
                    var m=doneIsArray?done[idx]:done;
                    if(m){
                        doneArgs[idx]=SafeExec(m,[model,isFail?{msg:args}:null,hasError?errorArgs:null],me);
                    }
                }else if(flag==FetchFlags.ORDER){
                    //var m=doneIsArray?done[idx]:done;
                    orderlyArr[idx]={m:model,e:isFail,s:args};
                    //console.log(S.clone(orderlyArr),idx);
                    for(var i=orderlyArr.i||0,t,d;t=orderlyArr[i];i++){
                        d=doneIsArray?done[i]:done;
                        doneArgs[i]=SafeExec(d,[t.m,t.e?{msg:t.s}:null,orderlyArr.e?errorArgs:null,doneArgs],me);
                        if(t.e){
                            errorArgs[i]=t.s;
                            orderlyArr.e=1;
                        }
                    }
                    orderlyArr.i=i;
                }

                if(cacheKey&&Has(modelsCacheKeys,cacheKey)){
                    var fns=modelsCacheKeys[cacheKey];
                    delete modelsCacheKeys[cacheKey];
                    SafeExec(fns,[isFail,model,args],model);
                }

                if(current>=total){
                    errorArgs.msg=errorMsg;
                    var last=hasError?errorArgs:null;
                    if(flag==FetchFlags.ALL){                           
                        doneArr.push(last);
                        doneArgs[0]=SafeExec(done,doneArr,me);
                        doneArgs[1]=last;
                    }else{
                        doneArgs.push(last);
                    }
                    me.$ntId=setTimeout(function(){//前面的任务可能从缓存中来，执行很快
                        me.$doTask=false;
                        console.log('doneArgsdoneArgs',doneArgs);
                        me.doNext(doneArgs);
                    },30);
                }
            };
            //console.log(me);
            
            for(var i=0,model;i<models.length;i++){
                model=models[i];
                if(model){
                    var modelEntity,modelInfo;
                    var modelInfo=host.getModel(model);
                    var cacheKey=modelInfo.cacheKey;
                    
                    if(cacheKey&&Has(modelsCacheKeys,cacheKey)){
                        modelsCacheKeys[cacheKey].push(WrapDone(doneFn,me,i));
                    }else{                        
                        modelEntity=modelInfo.entity;
                        if(modelInfo.needUpdate){
                            reqModels[modelEntity.id]=modelEntity;
                            if(cacheKey){
                                modelsCacheKeys[cacheKey]=[];
                            }
                            modelEntity.request({
                                success:WrapDone(doneFn,modelEntity,i,false,modelEntity),
                                error:WrapDone(doneFn,modelEntity,i,true,modelEntity)
                            });
                        }else{
                            doneFn(i,false,modelEntity);
                        }
                    }
                }else{
                    throw new Error('miss attrs:'+models);
                }
            }
            return me;
        },
        /**
         * 获取models，所有请求完成回调done
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        fetchAll:function(models,done){
            return this.fetchModels(models,done,FetchFlags.ALL);
        },
        /**
         * 保存models，所有请求完成回调done
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home'urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        saveAll:function(models,done){
            models=DeleteCacheKey(models);
            return this.fetchModels(models,done,FetchFlags.ALL);
        },
        /**
         * 获取models，按顺序执行回调done
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        fetchOrder:function(models,done){
            var cbs=Slice.call(arguments,1);
            return this.fetchModels(models,cbs.length>1?cbs:done,FetchFlags.ORDER);
        },
        /**
         * 保存models，按顺序执行回调done
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home'urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        saveOrder:function(models,done){
            models=DeleteCacheKey(models);
            var cbs=Slice.call(arguments,1);
            return this.fetchModels(models,cbs.length>1?cbs:done,FetchFlags.ORDER);
        },
        /**
         * 保存models，其中任意一个成功均立即回调，回调会被调用多次
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} callback   完成时的回调
         * @return {MRequest}
         */
        saveOne:function(models,callback){
            models=DeleteCacheKey(models);
            var cbs=Slice.call(arguments,1);
            return this.reqModels(models,cbs.length>1?cbs:callback,FetchFlags.ONE);
        },
        /**
         * 获取models，其中任意一个成功均立即回调，回调会被调用多次
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} callback   完成时的回调
         * @return {MRequest}
         */
        fetchOne:function(models,callback){
            var cbs=Slice.call(arguments,1);
            return this.fetchModels(models,cbs.length>1?cbs:callback,FetchFlags.ONE);
        },
        /**
         * 中止所有model的请求
         * 注意：调用该方法后会中止请求，并回调error方法
         */
        abort:function(){
            var me=this;
            clearTimeout(me.$ntId);
            var host=me.$host;
            var reqModels=me.$reqModels;
            var modelsCacheKeys=host.$mCacheKeys;

            if(reqModels){
                for(var p in reqModels){
                    var m=reqModels[p];
                    var cacheKey=m._cacheKey;
                    if(cacheKey&&Has(modelsCacheKeys,cacheKey)){
                        var fns=modelsCacheKeys[cacheKey];
                        delete modelsCacheKeys[cacheKey];
                        SafeExec(fns,[true,m,'aborted'],m);
                    }
                    m.abort();
                }
            }
            me.$reqModels={};
            me.$queue=[];
            me.$doTask=false;
        },
        /**
         * 前一个fetchX或saveX任务做完后的下一个任务
         * @param  {Function} fn 回调
         * @return {MRequest}
         */
        next:function(fn){
            var me=this;
            if(!me.$queue)me.$queue=[];
            me.$queue.push(fn);
            if(!me.$doTask){
                var args=me.$latest||[];
                me.doNext.apply(me,[me].concat(args));
            }
            return me;
        },
        /**
         * 做下一个任务
         * @private
         */
        doNext:function(preArgs){
            var me=this;
            var queue=me.$queue;
            if(queue){
                var one=queue.shift();
                if(one){
                    console.log(one,preArgs);
                    SafeExec(one,[me].concat(preArgs),me);
                }
            }
            me.$latest=preArgs;
        },
        /**
         * 销毁当前请求，与abort的区别是：abort后还可以继续发起新请求，而destroy后则不可以，而且不再回调相应的error方法
         */
        destroy:function(){
            var me=this;
            me.$destroy=true;
            me.abort();
        }
    });

    Magix.mix(MManager.prototype,{
        /**
         * @lends MManager#
         */
        /**
         * 注册APP中用到的model
         * @param {Object|Array} models 模块描述信息
         * @param {String} models.name app中model的唯一标识
         * @param {Object} models.options 传递的参数信息，如{uri:'test',isJSONP:true,updateIdent:true}
         * @param {Object} models.urlParams 发起请求时，默认的get参数对象
         * @param {Object} models.postParams 发起请求时，默认的post参数对象
         * @param {String} models.cacheKey 指定model缓存的key，当指定后，该model会进行缓存，下次不再发起请求
         * @param {Integer} models.cacheTime 缓存过期时间，以毫秒为单位，当过期后，再次使用该model时会发起新的请求(前提是该model指定cacheKey被缓存后cacheTime才有效)
         * @param {Function} models.before model在发起请求前的回调
         * @param {Function} models.after model在发起请求，并且通过Model.sync调用doneess后的回调
         * @example
         * KISSY.add("app/base/mmanager",function(S,MManager,Model){
                var MM=MManager.create(Model);
                MM.registerModels([
                    {
                        name:'Home_List',
                        options:{
                            uri:'test'
                        },
                        urlParams:{
                            a:'12'
                        },
                        cacheKey:'',
                        cacheTime:20000,//缓存多久
                        before:function(m){
                            console.log('before',m);
                        },
                        after:function(m){
                            console.log('after',m);
                        }
                    },
                    {
                        name:'Home_List1',
                        options:{
                            uri:'test'
                        },
                        before:function(m){
                            console.log('before',m);
                        },
                        after:function(m){
                            console.log('after',m);
                        }
                    }
                ]);
                return MM;
            },{
                requires:["mxext/mmanager","app/base/model"]
            });

            //使用

            KISSY.use('app/base/mmanager',function(S,MM){
                MM.fetchAll([
                    {name:'Home_List',cacheKey:'aaa',urlParams:{e:'f'}},
                    {name:'Home_List1',urlParams:{a:'b'}}
                ],function(m1,m2){
    
                },function(msg){
    
                });
            });
         */
        registerModels:function(models){
            /*
                name:'',
                options:{
                    uri:'',
                    jsonp:'true'
                },
                urlParams:'',
                postParams:'',
                cacheTime:20000,//缓存多久
                before:function(m){
    
                },
                after:function(m){
                    
                }
             */
            var me=this;
            var metas=me.$mMetas;

            if(!S.isArray(models)){
                models=[models];
            }
            for(var i=0,model;i<models.length;i++){
                model=models[i];
                if(!model.name){
                    throw new Error('model must own a name attribute');
                }
                metas[model.name]=model;
            }
        },
        /**
         * 注册方法，前面是参数，后面2个是成功和失败的回调
         * @param {Object} methods 方法对象
         */
        registerMethods:function(methods){
            var me=this;
            for(var p in methods){
                me[p]=(function(fn){
                    return function(){
                        var aborted;
                        var args=arguments;
                        var arr=[];
                        for(var i=0,a;i<args.length;i++){
                            a=args[i];
                            if(S.isFunction(a)){
                                arr.push((function(f){
                                    return function(){
                                        if(aborted)return;
                                        f.apply(f,arguments);
                                    }
                                }(a)));
                            }else{
                                arr.push(a);
                            }
                        }
                        var result=fn.apply(me,arr);
                        return {
                            destroy:function(){
                                aborted=true;
                                if(result&&result.destroy){
                                    result.destroy();
                                }
                            }
                        }
                    }
                }(methods[p]));
            }
        },
        /**
         * 调用当前Manager注册的多个方法
         * @param {Array} args 要调用的方法列表，形如：[{name:'x',params:['o']},{name:'y',params:['z']}]
         * @param {Function} done 成功时的回调，传入参数跟args数组中对应的成功方法的值
         * @param {Function} error 失败回调，参数同上
         * @return {Object} 返回一个带abort方法的对象，用于取消这些方法的调用
         * @example
         * var MM=MManager.create(Model);
         * MM.registerMethods({
         *     methodA:function(args,done,error){
         *         
         *     },
         *     methodB:function(args,done,error){
         *         
         *     }
         * });
         *
         * //...
         * //使用时：
         *
         * MM.callMethods([
         *     {name:'methodA',params:['a']},
         *     {name:'methodB',params:['b']}
         * ],function(f1Result,f2Result){
         *     
         * },function(msg){
         *     alert(msg)
         * })
         */
        /*callMethods:function(args,done,error){
            var me=this,
                doneArgs=[],
                errorMsg='',
                total=args.length,
                exec= 0,
                aborted,
                doneCheck=function(args,idx,isFail){
                    if(aborted)return;
                    exec++;
                    if(isFail){
                        errorMsg=args;
                    }else{
                         doneArgs[idx]=args;
                    }
                    if(total<=exec){
                        if(!errorMsg){
                            if(S.isFunction(done)){
                                done.apply(done,doneArgs);
                            }
                        }else{
                            if(S.isFunction(error)){
                                error(errorMsg);
                            }
                        }
                    }
                },
                check=function(idx,isSucc){
                    return function(args){
                        doneCheck(args,idx,!isSucc);
                    };
                };
            for(var i=0,one;i<args.length;i++){
                one=args[i];
                var fn;
                if(S.isFunction(one.name)){
                    fn=one.name;
                }else{
                    fn=me[one.name];
                }
                if(fn){
                    if(!one.params)one.params=[];
                    if(!S.isArray(one.params))one.params=[one.params];
                    
                    one.params.push(check(i,true),check(i));
                    fn.apply(me,one.params);
                }else{
                    doneCheck('unfound:'+one.name,i,true);
                }
            }
            return {
                abort:function(){
                    aborted=true;
                }
            }
        },*/
        /**
         * 创建model对象
         * @param {Object} modelAttrs           model描述信息对象
         * @return {Object}
         */
        createModel:function(modelAttrs){
            var me=this;
            var meta=me.getModelMeta(modelAttrs);            

            var entity=new me.$mClass(GetOptions(meta));

            var before=modelAttrs.before||meta.before;

            me.fireBefore(meta.name,[entity]);

            if(S.isFunction(before)){
                SafeExec(before,[entity,meta,modelAttrs]);
            }

            var after=modelAttrs.after||meta.after;

            entity._after=after;

            var cacheKey=modelAttrs.cacheKey||meta.cacheKey;

            if(S.isFunction(cacheKey)){
                cacheKey=SafeExec(cacheKey,[meta,modelAttrs]);
            }
            
            entity._cacheKey=cacheKey;
            entity._meta=meta;
            entity.set(GetOptions(modelAttrs));
            //默认设置的
            entity.setUrlParams(meta.urlParams);
            entity.setPostParams(meta.postParams);

            //临时传递的
            entity.setUrlParams(modelAttrs.urlParams);
            entity.setPostParams(modelAttrs.postParams);

            return entity;
        },
        /**
         * 获取model注册时的元信息
         * @param  {String|Object} modelAttrs 名称
         * @return {Object}
         * @throws {Error} If unfound:name
         */
        getModelMeta:function(modelAttrs){
            var me=this;
            var metas=me.$mMetas;
            var name;
            if(S.isString(modelAttrs)){
                name=modelAttrs;
            }else{
                name=modelAttrs.name;
            }
            var meta=metas[name];
            if(!meta){
                console.log(modelAttrs);
                throw new Error('Not found:'+modelAttrs.name);
            }
            return meta;
        },
        /**
         * 获取model对象，优先从缓存中获取
         * @param {Object} modelAttrs           model描述信息对象
         * @return {Object}
         */
        getModel:function(modelAttrs){
            var me=this;
            var entity=me.getCachedModel(modelAttrs);
            var needUpdate;
            if(!entity){
                needUpdate=true;
                entity=me.createModel(modelAttrs);
            }
            return {
                entity:entity,
                cacheKey:entity._cacheKey,
                needUpdate:needUpdate
            }
        },
        /**
         * 保存models，所有请求完成回调done
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home'urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        saveAll:function(models,done){
            return new MRequest(this).saveAll(models,done);
        },
        /**
         * 获取models，所有请求完成回调done
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        fetchAll:function(models,done){
            return new MRequest(this).fetchAll(models,done);
        },
        /**
         * 保存models，按顺序回回调done
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home'urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        saveOrder:function(models,done){
            var mr=new MRequest(this);
            return mr.saveOrder.apply(mr,arguments);
        },
        /**
         * 获取models，按顺序回回调done
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} done   完成时的回调
         * @return {MRequest}
         */
        fetchOrder:function(models,done){
            var mr=new MRequest(this);
            return mr.fetchOrder.apply(mr,arguments);
        },
        /**
         * 保存models，其中任意一个成功均立即回调，回调会被调用多次
         * @param {String|Array} models 保存models时的描述信息，如:{name:'Home',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} callback   完成时的回调
         * @return {MRequest}
         */
        saveOne:function(models,callback){
            var mr=new MRequest(this);
            return mr.saveOne.apply(mr,arguments);
        },
        /**
         * 获取models，其中任意一个成功均立即回调，回调会被调用多次
         * @param {String|Array} models 获取models时的描述信息，如:{name:'Home',cacheKey:'key',urlParams:{a:'12'},postParams:{b:2}}
         * @param {Function} callback   完成时的回调
         * @return {MRequest}
         */
        fetchOne:function(models,callback){
            var mr=new MRequest(this);
            return mr.fetchOne.apply(mr,arguments);
        },
        /**
         * 根据key清除缓存的models
         * @param  {String} key 字符串
         */
        clearCacheByKey:function(key){
            var me=this;
            var modelsCache=me.$mCache;
            if(S.isString(key)){
                modelsCache.del(key);
            }
        },
        /**
         * 根据name清除缓存的models
         * @param  {String} name 字符串
         */
        clearCacheByName:function(name){
            var me=this;
            var modelsCache=me.$mCache;
            var test;
            var list=modelsCache.c;
            for(var i=0;i<list.length;i++){
                var one=list[i];
                var m=one.v;
                var tName=m&&m._meta.name;
                if(tName==name){
                    modelsCache.del(m._cacheKey);
                }
            }
        },
        /**
         * 获取model的url
         * @param  {String|Object} name model元信息名称
         * @return {String}
         */
        getModelUrl:function(name){
            var me=this;
            var meta=me.getModelMeta(name);
            return me.$mClass.prototype.url(meta.uri);
        },
        /**
         * 监听某个model的before
         * @param  {String}   name     注册时元信息中的名称
         * @param  {Function} callback 回调
         */
        listenBefore:function(name,callback){
            Event.on.call(this,name+BEFORE,callback);
        },
        /**
         * 监听某个model的after
         * @param  {String}   name     注册时元信息中的名称
         * @param  {Function} callback 回调
         */
        listenAfter:function(name,callback){
            Event.on.call(this,name+AFTER,callback);
        },
        /**
         * 取消before监听
         * @param  {String}   name     注册时元信息的名称
         * @param  {Function} [callback] 回调
         */
        unlistenBefore:function(name,callback){
            Event.un.call(this,name+BEFORE,callback);
        },
        /**
         * 取消after监听
         * @param  {String}   name     注册时元信息的名称
         * @param  {Function} [callback] 回调
         */
        unlistenAfter:function(name,callback){
            Event.un.call(this,name+AFTER,callback);
        },
        /**
         * 触发某个model的before监听
         * @param  {String} name 注册时元信息中的名称
         * @param  {Object} [args] 数据
         */
        fireBefore:function(name,args){
            Event.fire.call(this,name+BEFORE,args);
        },
        /**
         * 触发某个model的after监听
         * @param  {String} name 注册时元信息中的名称
         * @param  {Object} [args] 数据
         */
        fireAfter:function(name,args){
            Event.fire.call(this,name+AFTER,args);
        },
        /**
         * 从缓存中获取model对象
         * @param  {String|Object} modelAttrs
         * @return {Model}
         */
        getCachedModel:function(modelAttrs){
            var me=this;
            var modelsCache=me.$mCache;
            var entity=null;
            var cacheKey;
            var meta;
            if(S.isString(modelAttrs)){
                cacheKey=modelAttrs;
            }else{
                meta=me.getModelMeta(modelAttrs);
                cacheKey=modelAttrs.cacheKey||meta.cacheKey;
                if(S.isFunction(cacheKey)){
                    cacheKey=SafeExec(cacheKey,[meta,modelAttrs]);
                }
            }

            if(cacheKey&&(entity=modelsCache.get(cacheKey))){//缓存
                
                if(!meta)meta=entity._meta;

                var cacheTime=modelAttrs.cacheTime||meta.cacheTime||0;

                if(S.isFunction(cacheTime)){
                    cacheTime=SafeExec(cacheTime,[meta,modelAttrs]);
                }

                if(cacheTime>0){
                    if(S.now()-entity._doneAt>cacheTime){
                        me.clearCacheByKey(cacheKey);
                        entity=null;
                    }
                }
            }
            return entity;
        }
    });
    return MManager;
},{
    requires:["magix/magix","magix/event"]
});