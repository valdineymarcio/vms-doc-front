const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
    const elements = new Map();
    const storage = () => { const data = new Map(); return {getItem: key => data.get(key) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)}; };
    const element = () => ({value: '', disabled: false, innerText: '', innerHTML: '', style: {}, children: [], appendChild(child) {this.children.push(child);}, remove() {}, addEventListener() {}, getContext() {return {};}});
    const events = {};
    const revoked = [];
    const calls = [];
    const alerts = [];
    const context = vm.createContext({console, URL: {createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url)}, URLSearchParams,
        setTimeout: callback => callback(), localStorage: storage(), sessionStorage: storage(), alert: message => alerts.push(message),
        document: {documentElement: {setAttribute() {}}, addEventListener() {}, getElementById: id => elements.get(id) || null,
            querySelector: () => null, querySelectorAll: () => [], createElement: () => element()},
        window: {location: {}, addEventListener: (event, callback) => events[event] = callback},
        fetch: async (url, options) => {calls.push({url, options}); return {ok: true, status: 200, headers: {get: () => 'application/json'}, json: async () => ({})};}
    });
    vm.runInContext(fs.readFileSync('frontend/js/api.js','utf8'),context);
    const run = source => vm.runInContext(source,context);
    context.localStorage.setItem('token','test-token');
    return {context, run, elements, element, events, revoked, calls, alerts};
}
function json(data, status = 200) {return {ok: status < 400, status, headers: {get: () => 'application/json'}, json: async () => data, clone() {return this;}, text: async () => JSON.stringify(data)};}

test('protected requests carry Bearer; backend errors are preserved; 401 clears session', async () => {
    const h = setup();
    await h.run("apiRequest('/api/transfers/inbox')");
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer test-token');
    for (const status of [400,403,404,409,500]) {
        h.context.fetch = async () => json({message: 'backend '+status},status);
        await assert.rejects(h.run("apiRequest('/api/transfers/t/view')"), new RegExp('backend '+status));
    }
    h.context.fetch = async () => json({message: 'Token expirado'},401);
    await assert.rejects(h.run("apiRequest('/api/transfers/t/view')"), /Token expirado/);
    assert.equal(h.context.localStorage.getItem('token'),null);
    assert.equal(h.context.window.location.href,'index.html');
    assert.equal(h.context.sessionStorage.getItem('authError'),'Token expirado');
});

test('login stores token; upload uses authenticated multipart without JSON content type', async () => {
    const h = setup();
    for (const id of ['email','password','msg','title','description','categoryId','file']) h.elements.set(id,h.element());
    h.elements.get('email').value = 'a@example.com'; h.elements.get('password').value = 'secret';
    h.context.fetch = async () => json({token:'new-token'});
    await h.run('login()');
    assert.equal(h.context.localStorage.getItem('token'),'new-token');
    h.context.FormData = class {append() {}};
    h.elements.get('title').value = 'PDF'; h.elements.get('file').files = [{}];
    h.context.fetch = async (url, options) => {h.calls.push({url,options}); return json({id:'doc'});};
    await h.run('uploadDocument()');
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer new-token');
    assert.equal(h.calls[0].options.headers['Content-Type'],undefined);
});

test('send is serialized; partial sender-sign failure retries the existing transfer; copies remain independent', async () => {
    const h = setup();
    for (const id of ['sendDocumentId','sendReceiverId','sendMsg']) h.elements.set(id,h.element());
    h.elements.get('sendDocumentId').value = 'doc'; h.elements.get('sendReceiverId').value = 'B';
    let sends = 0, signs = 0;
    h.context.fetch = async (url, options) => {
        h.calls.push({url,options});
        if(url.endsWith('/send')) return json({id:'copy'+(++sends),status:'SENT'});
        if(url.endsWith('/sign-sender')) {if(++signs === 1) return json({message:'Falha assinatura'},500); return json({status:'SENT'});}
        throw Error(url);
    };
    h.run("pendingSenderSignature = {documentId:'doc',page:1,x:40,y:100}");
    await Promise.all([h.run('sendDocumentToUser()'),h.run('sendDocumentToUser()')]);
    assert.equal(sends,1); assert.equal(signs,1);
    await h.run('sendDocumentToUser()');
    assert.equal(sends,1); assert.equal(signs,2);
    assert.equal(h.calls.filter(c=>c.url.endsWith('/sign-sender')).every(c=>c.url.includes('/copy1/')),true);
    h.elements.get('sendDocumentId').value = 'doc'; h.elements.get('sendReceiverId').value = 'C';
    await h.run('sendDocumentToUser()');
    assert.equal(sends,2);
    assert.equal(h.calls.some(c=>c.url.includes('/sign-positioned')),false);
});

test('recipient signs and returns with one PATCH; duplicate and RETURNED signing blocked', async () => {
    const h = setup();
    h.run("embeddedSignState = {mode:'transfer', transferId:'copy1', page:1,x:40,y:220}");
    h.context.fetch = async (url,options) => {h.calls.push({url,options}); return json(url.endsWith('/sign') ? {id:'copy1',status:'RETURNED'} : []);};
    await Promise.all([h.run('confirmEmbeddedSignature()'),h.run('confirmEmbeddedSignature()')]);
    assert.equal(h.calls.filter(c=>c.options.method === 'PATCH').length,1);
    assert.equal(h.calls[0].url,'http://localhost:8080/api/transfers/copy1/sign');
    assert.deepEqual(JSON.parse(h.calls[0].options.body),{page:1,x:40,y:220});
    h.run("embeddedSignState = {mode:'transfer',transferId:'copy1',page:1,x:1,y:1}");
    await h.run('confirmEmbeddedSignature()');
    assert.equal(h.calls.filter(c=>c.options.method === 'PATCH').length,1);
});

test('PDF view fetches transfer ID with auth, refreshes inbox, renders object URL and releases it', async () => {
    const h = setup();
    h.elements.set('viewer',h.element());
    let refreshed = 0;
    h.context.document.querySelector = selector => selector.includes('inboxTable') ? {} : null;
    h.context.pdfjsLib = {getDocument: config => {assert.equal(config.url,'blob:test'); return {promise: Promise.resolve({numPages:0,destroy() {}})};}};
    h.run('loadInbox = async () => {refreshCount()};'); h.context.refreshCount = () => refreshed++;
    h.context.fetch = async (url,options) => {h.calls.push({url,options}); return {ok:true,status:200,headers:{get:()=> 'application/pdf'},blob:async()=>({type:'application/pdf'})};};
    await h.run("openEmbeddedViewer({mode:'view',transferId:'copy1',documentId:'original',containerId:'viewer'})");
    assert.equal(h.calls[0].url,'http://localhost:8080/api/transfers/copy1/view');
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer test-token');
    assert.equal(refreshed,1);
    h.run('clearEmbeddedViewer()');
    assert.deepEqual(h.revoked,['blob:test']);
});

test('finite coordinates and page numbering validated; PDF viewport handles displayed scale', () => {
    const h = setup();
    for(const value of ['{page:0,x:1,y:1}','{page:1,x:NaN,y:1}','{page:1,x:1,y:Infinity}','{page:1,x:-1,y:1}']) assert.throws(()=>h.run('validateSignaturePosition('+value+')'));
    let received;
    h.context.event = {clientX:110,clientY:220};
    h.context.canvas = {width:280,height:560,getBoundingClientRect:()=>({left:10,top:20,width:140,height:280})};
    h.context.wrapper = h.element();
    h.context.viewport = {convertToPdfPoint:(x,y)=>{received=[x,y];return [x/1.4,400-y/1.4];}};
    h.run('handleSignaturePlacement(event,canvas,wrapper,1,viewport)');
    assert.deepEqual(received,[200,400]);
    assert.equal(h.run('embeddedSignState.x'),200/1.4);
    assert.equal(h.run('embeddedSignState.y'),400-400/1.4);
});

test('search combines title and category', () => {
    const h = setup();
    assert.equal(h.run("documentSearchPath(' contrato ','category')"),'/api/documents/search?title=contrato&categoryId=category');
});

test('returned list opens the transfer copy and offers no sign action', async () => {
    const h = setup();
    const body = h.element(); body.replaceChildren = function() {this.children=[];};
    h.context.document.querySelector = selector => selector === '#returnedTable tbody' ? body : null;
    h.context.fetch = async (url, options) => {
        h.calls.push({url,options});
        return json([{id:'returned-copy', documentId:'original',documentTitle:'Contract',receiverName:'B',status:'RETURNED'}]);
    };
    let click;
    h.context.document.createElement = tag => {
        const el = h.element();
        if(tag === 'button') el.addEventListener = (event, callback) => click = callback;
        return el;
    };
    let config;
    h.context.capture = value => config = value;
    h.run('openEmbeddedViewer = async config => capture(config)');
    await h.run('loadReturnedTransfers()');
    assert.equal(h.calls[0].url,'http://localhost:8080/api/transfers/returned');
    assert.equal(body.children.length,1);
    await click();
    assert.equal(config.transferId,'returned-copy');
    assert.equal(config.mode,'view');
    assert.equal(config.documentId,undefined);
});

test('denied file requests show backend message without opening a PDF', async () => {
    const h = setup(); h.elements.set('viewer',h.element());
    h.context.fetch = async () => json({message:'Access denied to third party'},403);
    await assert.rejects(h.run("openEmbeddedViewer({mode:'view',transferId:'private',containerId:'viewer'})"), /Access denied to third party/);
    assert.equal(h.run('viewerObjectUrl'),null);
});

function dashboardSetup() {
    const h = setup();
    const listeners = new Map();
    let interval;
    h.context.setInterval = callback => {interval = callback; return 1;};
    h.context.clearInterval = () => {interval = null;};
    h.context.window.addEventListener = (name, callback) => listeners.set(name, callback);
    h.context.document.addEventListener = (name, callback) => listeners.set(name, callback);
    h.context.document.visibilityState = 'visible';
    h.context.document.hidden = false;
    h.context.document.querySelector = () => null;
    vm.runInContext(fs.readFileSync('frontend/js/dashboard.js','utf8'), h.context);
    h.run('bootPage = async () => true; renderDashboardUser = () => {}; loadDashboardDocuments = async () => {}; loadDashboardInbox = async () => {}; loadCategoriesSelect = async () => {};');
    return {...h, listeners, interval: () => interval};
}

test('sender dashboard refreshes returned copies when revisited and while visible', async () => {
    const h = dashboardSetup();
    let loads = 0;
    h.context.recordLoad = () => loads++;
    h.run('loadReturnedTransfers = async () => { recordLoad(); };');
    await h.run('initDashboardPage()');
    assert.equal(loads, 1);
    assert.equal(typeof h.listeners.get('focus'), 'function');
    await h.listeners.get('focus')();
    assert.equal(loads, 2);
    assert.equal(typeof h.interval(), 'function');
    await h.interval()();
    assert.equal(loads, 3);
    h.context.document.hidden = true;
    await h.interval()();
    assert.equal(loads, 3);
});

test('a sender with an empty list sees a newly RETURNED transfer on focus', async () => {
    const h = dashboardSetup();
    const body = h.element(); body.replaceChildren = function() {this.children=[]; this.innerHTML='';};
    h.context.document.querySelector = selector => selector === '#returnedTable tbody' ? body : null;
    h.elements.set('returnedListInfo', h.element());
    h.run("currentUser = {id:'sender-A',name:'Sender A'}");
    let returned = false;
    h.context.fetch = async (url, options) => {
        h.calls.push({url,options});
        return json(returned ? [{id:'copy',documentId:'original',documentTitle:'nota nova',receiverName:'B',status:'RETURNED'}] : []);
    };
    await h.run('initDashboardPage()');
    assert.match(body.innerHTML,/Nenhum documento/);
    returned = true;
    await h.listeners.get('focus')();
    assert.equal(body.children.length,1);
    assert.equal(body.children[0].children[0].textContent,'nota nova');
    assert.match(h.elements.get('returnedListInfo').textContent,/Sender A/);
    assert.equal(h.calls.length,2);
    assert.equal(h.calls.every(call=>call.url.endsWith('/api/transfers/returned') && call.options.headers.Authorization==='Bearer test-token' && call.options.cache==='no-store'),true);
});

test('overlapping refresh requests reuse the same response and do not erase returned rows', async () => {
    const h = setup();
    const body = h.element(); body.replaceChildren = function() {this.children=[];};
    h.context.document.querySelector = selector => selector === '#returnedTable tbody' ? body : null;
    let resolve;
    h.context.fetch = (url,options) => { h.calls.push({url,options}); return new Promise(done => resolve=done); };
    const first = h.run('loadReturnedTransfers()');
    const second = h.run('loadReturnedTransfers()');
    assert.equal(h.calls.length,1);
    resolve(json([{id:'copy',status:'RETURNED',documentTitle:'nota nova'}]));
    await Promise.all([first,second]);
    assert.equal(body.children.length,1);
});

test('returned API failure identifies method, URL, HTTP status and backend message', async () => {
    const h = setup();
    const body = h.element(); body.replaceChildren = function() {this.children=[];};
    body.insertRow = () => ({insertCell: () => h.element()});
    h.context.document.querySelector = selector => selector === '#returnedTable tbody' ? body : null;
    h.elements.set('returnedListInfo',h.element());
    h.context.fetch = async () => json({message:'Access denied'},403);
    await h.run('loadReturnedTransfers()');
    const message=h.elements.get('returnedListInfo').textContent;
    assert.match(message,/GET http:\/\/localhost:8080\/api\/transfers\/returned/);
    assert.match(message,/HTTP 403/);
    assert.match(message,/Access denied/);
    assert.equal(message.includes('test-token'),false);
});

function folderSetup() {
    const h = setup();
    const wrapper = h.element();
    for(const id of ['folderDocumentSearch','folderSearchScope','folderDocumentsSection','folderDocumentsEmptyState',
        'folderSearchFeedback','folderSearchButton','expandFolderSearchButton','selectedCategoryTitle',
        'selectedCategoryDescription','closeFolderResultsButton','folderEmptyTitle','folderEmptyDescription',
        'clearFolderSearchButton','categoryDocumentsTable','folderSearchForm']) {
        const element = h.element(); element.dataset={}; element.hidden=false;
        element.setAttribute = (key,value) => {element[key]=value;};
        element.focus = () => {};
        element.closest = () => wrapper;
        h.elements.set(id,element);
    }
    const body = h.element(); body.replaceChildren = function(){this.children=[];}; body.closest = () => wrapper;
    h.context.document.querySelector = selector => selector === '#categoryDocumentsTable tbody' ? body : null;
    h.context.document.createElement = () => {const element=h.element();element.setAttribute=()=>{};return element;};
    h.elements.get('folderSearchForm').reset = () => {
        h.elements.get('folderDocumentSearch').value='';h.elements.get('folderSearchScope').value='';
    };
    h.run("folderCategories = [{id:'category',name:'Contratos',description:'Acordos da empresa'}]");
    return {...h, body, wrapper};
}

test('folder search sends title and category together with authentication', async () => {
    const h=folderSetup();
    h.elements.get('folderDocumentSearch').value=' termo & contrato ';
    h.elements.get('folderSearchScope').value='category';
    h.context.fetch=async (url,options)=>{h.calls.push({url,options});return json([{id:'doc',title:'termo & contrato'}]);};
    await h.run('searchFolderDocuments()');
    const url=new URL(h.calls[0].url);
    assert.equal(url.searchParams.get('title'),'termo & contrato');
    assert.equal(url.searchParams.get('categoryId'),'category');
    assert.equal(h.calls[0].options.headers.Authorization,'Bearer test-token');
    assert.equal(h.body.children.length,1);
    assert.equal(h.elements.get('selectedCategoryTitle').textContent,'Pasta: Contratos');
    assert.match(h.elements.get('folderSearchFeedback').textContent,/1 documento encontrado/);
});

test('empty folder search can expand globally without losing the title', async () => {
    const h=folderSetup();
    h.elements.get('folderDocumentSearch').value='nota';
    h.elements.get('folderSearchScope').value='category';
    h.context.fetch=async (url,options)=>{h.calls.push({url,options});return json(new URL(url).searchParams.has('categoryId')?[]:[{id:'uncategorized',title:'nota'}]);};
    await h.run('searchFolderDocuments()');
    assert.equal(h.elements.get('expandFolderSearchButton').hidden,false);
    assert.equal(h.wrapper.style.display,'none');
    await h.run('searchAllFolders()');
    assert.equal(h.elements.get('folderDocumentSearch').value,'nota');
    assert.equal(new URL(h.calls[1].url).searchParams.has('categoryId'),false);
    assert.equal(h.body.children.length,1);
    assert.equal(h.elements.get('selectedCategoryTitle').textContent,'Todos os documentos');
});

test('clearing a title keeps the selected folder and restores all its documents', async () => {
    const h=folderSetup();
    h.elements.get('folderDocumentSearch').value='contract';
    h.elements.get('folderSearchScope').value='category';
    h.context.fetch=async (url,options)=>{h.calls.push({url,options});return json([]);};
    await h.run('clearFolderSearch()');
    const url=new URL(h.calls[0].url);
    assert.equal(url.searchParams.has('title'),false);
    assert.equal(url.searchParams.get('categoryId'),'category');
    assert.equal(h.elements.get('clearFolderSearchButton').disabled,true);
});

test('older folder search responses cannot overwrite the latest results', async () => {
    const h=folderSetup(); const responses=[];
    h.context.fetch=()=>new Promise(resolve=>responses.push(resolve));
    h.elements.get('folderDocumentSearch').value='old';
    const old=h.run('searchFolderDocuments()');
    h.elements.get('folderDocumentSearch').value='new';
    const current=h.run('searchFolderDocuments()');
    responses[1](json([{id:'new',title:'Latest document'}])); await current;
    responses[0](json([{id:'old',title:'Outdated document'}])); await old;
    assert.equal(h.body.children[0].children[0].children[0].textContent,'Latest document');
    assert.match(h.elements.get('folderSearchFeedback').textContent,/new/);
    assert.equal(h.elements.get('folderSearchButton').disabled,false);
});

test('closing results prevents an in-flight response from reopening them', async () => {
    const h=folderSetup(); let resolve;
    h.context.fetch=()=>new Promise(done=>resolve=done);
    const request=h.run('searchFolderDocuments()');
    h.run('resetFolderSearch()');
    resolve(json([{id:'doc',title:'Late result'}]));await request;
    assert.equal(h.elements.get('folderDocumentsSection').style.display,'none');
    assert.equal(h.body.children.length,0);
    assert.equal(h.elements.get('folderSearchButton').disabled,false);
});

test('backend search errors remain distinct from empty results and allow retry', async () => {
    const h=folderSetup();
    h.context.fetch=async()=>json({message:'Search unavailable'},500);
    await h.run('searchFolderDocuments()');
    assert.match(h.elements.get('folderSearchFeedback').textContent,/Search unavailable/);
    assert.equal(h.elements.get('folderSearchFeedback').dataset.kind,'error');
    assert.equal(h.elements.get('folderDocumentsEmptyState').style.display,'none');
    assert.equal(h.elements.get('folderSearchButton').disabled,false);
});
