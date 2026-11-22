// Tiny route-local bootstrap: starts the cover request before the viewer bundle.
(() => {
    const script=document.currentScript;
    const showCover=()=>{
    const covers=JSON.parse(script.dataset.posters||'{}');
    const track=new URLSearchParams(location.search).get('track')||'plaza';
    const path=covers[track]||covers.default;
    if(!path)return;
    const dataBase=new URL(script.dataset.assetBase||'../data/',script.src);
    const resolved=new URL(path,dataBase);
    if(path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||resolved.origin!==dataBase.origin||!resolved.pathname.startsWith(dataBase.pathname))return;
    const url=resolved.href;
    const preload=document.createElement('link');preload.rel='preload';preload.as='image';preload.href=url;document.head.append(preload);
    const cover=document.createElement('div');cover.id='opening-cover';
    Object.assign(cover.style,{position:'fixed',inset:'0',zIndex:'1',pointerEvents:'none',backgroundColor:'#243444',backgroundImage:`url("${url}")`,backgroundPosition:'center',backgroundSize:'cover'});
    document.body.prepend(cover);
    // Hand off only after the Viewer's image has painted (or its load has failed).
    const observer=new MutationObserver(()=>{
        const status=document.querySelector('[data-poster-status]')?.getAttribute('data-poster-status');
        if(status&&status!=='pending'){cover.remove();observer.disconnect();}
    });
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-poster-status']});
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
    };
    if(script.dataset.waitForHost==='true')window.addEventListener('ac-media-tour:authorized-start',showCover,{once:true});
    else showCover();
})();
