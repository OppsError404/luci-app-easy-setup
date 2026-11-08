  var BASE = window.location.pathname.replace(/\/aps\/?$/, "");

  var EYE_ON  = '<svg class="eye-on"  width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg class="eye-off" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  var CHEVRON_DOWN = '<svg class="extra-opt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHEVRON = '<svg class="csel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  var _activeBand = "2g";
  var _bandCfg    = {};
  var _wpa3Supported = false;

  // Build the Security <option> list. WPA3 (sae) is only offered when the
  // running wpad/hostapd supports SAE; an existing sae config is still
  // rendered (selected) so a saved WPA3 SSID stays representable if support
  // is later removed, letting the user pick another mode.
  function _encOpts(selected){
    var s=selected||"none";
    var o='<option value="none"'+(s==="none"?" selected":"")+'>Open</option>'+
          '<option value="psk"'+(s==="psk"?" selected":"")+'>WPA</option>'+
          '<option value="psk2"'+(s==="psk2"?" selected":"")+'>WPA2</option>'+
          '<option value="psk-mixed"'+(s==="psk-mixed"?" selected":"")+'>WPA/WPA2</option>';
    if(_wpa3Supported||s==="sae") o+='<option value="sae"'+(s==="sae"?" selected":"")+'>WPA3</option>';
    return o;
  }

  // ── Theme ─────────────────────────────────────────────────────────────────────
  (function initTheme() {
    var wrap = document.querySelector(".nc-wrap");
    function apply(isLight) { if (wrap) wrap.classList.toggle("theme-light", isLight); }
    var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq ? !mq.matches : false);
    if (mq && mq.addEventListener) mq.addEventListener("change", function(e) { apply(!e.matches); });
  })();

  // ── Band tab switch ───────────────────────────────────────────────────────────
  function switchBand(b, btn) {
    document.querySelectorAll(".band-panel").forEach(function(el) { el.classList.remove("active"); });
    document.querySelectorAll(".band-tab").forEach(function(el) { el.classList.remove("active"); });
    var bp = document.getElementById("bp-"+b);
    if (bp) bp.classList.add("active");
    if (btn) btn.classList.add("active");
    _activeBand = b;
  }

  // ── Utility helpers ───────────────────────────────────────────────────────────
  function setVal(id, v)  { var e=document.getElementById(id); if(e) e.value=(v||""); }
  function setChk(id, v)  { var e=document.getElementById(id); if(e) e.checked=!!v; }
  function selVal(id, v)  {
    var e=document.getElementById(id); if(!e) return;
    for(var i=0;i<e.options.length;i++) if(e.options[i].value===v){e.selectedIndex=i;break;}
    if(e._cselSync) e._cselSync();
  }
  function dimCard(id, dim) { var el=document.getElementById(id); if(el) el.classList.toggle("dim", dim); }
  function toggleKey(wrapId, enc) { var el=document.getElementById(wrapId); if(el) el.style.display=(enc==="none"?"none":""); }
  function toggleEye(btn, id) {
    var el=document.getElementById(id);
    var showing=el.type==="password";
    el.type=showing?"text":"password";
    btn.classList.toggle("shown",showing);
    btn.setAttribute("aria-label",showing?"Hide password":"Show password");
  }
  function toggleExtraOptions(sfx) {
    var detail=document.getElementById("extra-opt-"+sfx);
    var chevron=document.getElementById("extra-opt-chevron-"+sfx);
    if(!detail) return;
    var open=detail.classList.toggle("open");
    if(chevron) chevron.style.transform = open ? "rotate(180deg)" : "";
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  var _dirty = {};
  var _snapshot = {};
  var _pendingDelete = {};

  function _getFieldVal(id) {
    var el=document.getElementById(id); if(!el) return null;
    if(el.type==="checkbox") return el.checked;
    return el.value;
  }
  function snapshotCard(sfx) {
    var snap={};
    snap.ssid=_getFieldVal("ssid-"+sfx); snap.enc=_getFieldVal("enc-"+sfx);
    snap.key=_getFieldVal("key-"+sfx); snap.hidden=_getFieldVal("hid-"+sfx);
    snap.enabled=_getFieldVal("en-"+sfx); snap.roam=_getFieldVal("roam-"+sfx);
    snap.isolate=_getFieldVal("isolate-"+sfx); snap.wnm=_getFieldVal("wnm-"+sfx);
    _snapshot[sfx]=snap;
  }
  function _cardMatchesSnapshot(sfx) {
    var snap=_snapshot[sfx]; if(!snap) return false;
    return String(snap.ssid)===String(_getFieldVal("ssid-"+sfx)) &&
           String(snap.enc)===String(_getFieldVal("enc-"+sfx)) &&
           String(snap.key)===String(_getFieldVal("key-"+sfx)) &&
           String(snap.hidden)===String(_getFieldVal("hid-"+sfx)) &&
           Boolean(snap.enabled)===Boolean(_getFieldVal("en-"+sfx)) &&
           Boolean(snap.roam)===Boolean(_getFieldVal("roam-"+sfx)) &&
           Boolean(snap.isolate)===Boolean(_getFieldVal("isolate-"+sfx)) &&
           Boolean(snap.wnm)===Boolean(_getFieldVal("wnm-"+sfx));
  }
  function markDirty(sfx) {
    var cardEl=document.getElementById("ssid-"+sfx);
    if(cardEl) cardEl=cardEl.closest(".nc-card");
    if(cardEl&&cardEl.hasAttribute("data-new-ssid")) return;
    if(_cardMatchesSnapshot(sfx)) { markClean(sfx); return; }
    _dirty[sfx]=true;
    updateUniversalSave();
  }
  function markClean(sfx) {
    _dirty[sfx]=false;
    var btn=document.getElementById("savebtn-"+sfx); if(btn&&!_pendingDelete[sfx]) btn.disabled=true;
    var bandMatch=_snapshot[sfx]?sfx.match(/^(.+)-\d+$/):null;
    if(bandMatch) {
      var band=bandMatch[1];
      var ifaces=(_bandCfg[band]&&_bandCfg[band].ifaces)||[];
      var anyDirty=false;
      for(var i=0;i<ifaces.length;i++) { if(_dirty[band+"-"+(i+1)]||_pendingDelete[band+"-"+(i+1)]) { anyDirty=true; break; } }
      var allBtn=document.getElementById("savebtn-all-"+band); if(allBtn) allBtn.disabled=!anyDirty;
    }
  }

  // ── Delete staging ────────────────────────────────────────────────────────────
  function markDeleteIface(band, ifaceIdx) {
    var n=ifaceIdx+1, sfx=band+"-"+n;
    var delBtn=document.getElementById("delbtn-"+sfx); if(!delBtn) return;
    var cardEl=delBtn.closest(".nc-card");
    var cardHead=cardEl.querySelector(".nc-card-head");
    var pending=!_pendingDelete[sfx];
    _pendingDelete[sfx]=pending;
    if(pending) {
      cardEl.classList.add("pending-delete");
      if(cardHead) cardHead.classList.add("head-del-ssid");
      delBtn.textContent="Undo Remove"; delBtn.className="btn-undo-delete"; delBtn.style.marginRight="auto";
      _dirty[sfx]=true;
    } else {
      cardEl.classList.remove("pending-delete");
      if(cardHead) cardHead.classList.remove("head-del-ssid");
      delBtn.textContent="Remove"; delBtn.className="btn-delete-iface"; delBtn.style.marginRight="auto";
      _dirty[sfx]=false;
    }
    updateUniversalSave();
  }

  // ── Change log builders ───────────────────────────────────────────────────────
  function _buildIfaceChanges(sfx, snap) {
    if(!snap) return [];
    var lines=[];
    var encLabels={none:"Open",psk:"WPA",psk2:"WPA2","psk-mixed":"WPA/WPA2",sae:"WPA3"};
    var newSsid=_getFieldVal("ssid-"+sfx), newEnc=_getFieldVal("enc-"+sfx);
    var newHid=_getFieldVal("hid-"+sfx), newEn=_getFieldVal("en-"+sfx);
    if(snap.ssid!==newSsid) lines.push("SSID renamed: \""+snap.ssid+"\" -> \""+newSsid+"\"");
    if(snap.enc!==newEnc)   lines.push("Security changed to "+(encLabels[newEnc]||newEnc));
    if(snap.key!==_getFieldVal("key-"+sfx)&&newEnc!=="none") lines.push("Password updated");
    if(snap.hidden!==newHid) lines.push(newHid==="1"?"SSID hidden":"SSID broadcast enabled");
    if(snap.enabled!==newEn) lines.push(newEn?"SSID enabled":"SSID disabled");
    if(snap.roam!==_getFieldVal("roam-"+sfx)) lines.push(_getFieldVal("roam-"+sfx)?"Roaming Assist enabled":"Roaming Assist disabled");
    if(snap.isolate!==_getFieldVal("isolate-"+sfx)) lines.push(_getFieldVal("isolate-"+sfx)?"Client Isolation enabled":"Client Isolation disabled");
    if(snap.wnm!==_getFieldVal("wnm-"+sfx)) lines.push(_getFieldVal("wnm-"+sfx)?"Power Saving enabled":"Power Saving disabled");
    return lines;
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  function _validateIfaceKey(enc, keyEl) {
    keyEl.classList.remove("field-error");
    var errEl=keyEl.parentNode.querySelector(".field-error-msg"); if(errEl) errEl.remove();
    if(enc!=="none"&&keyEl.value.length<8) {
      keyEl.classList.add("field-error");
      var msg=document.createElement("span"); msg.className="field-error-msg";
      msg.textContent="Password must be at least 8 characters.";
      msg.style.display="block";
      keyEl.insertAdjacentElement('afterend', msg);
      keyEl.focus(); return false;
    }
    return true;
  }
  function _setFieldError(el, msg) {
    if(!el) return;
    el.classList.add("field-error");
    var existing=el.parentNode.querySelector(".field-error-msg"); if(existing) existing.remove();
    var e=document.createElement("span"); e.className="field-error-msg"; e.textContent=msg;
    e.style.display="block";
    el.insertAdjacentElement('afterend', e);
    el.oninput=function(){this.classList.remove("field-error");var m=this.parentNode.querySelector(".field-error-msg");if(m)m.remove();};
  }

  // ── Save primitives ───────────────────────────────────────────────────────────
  function _doSaveIface(band, ifaceIdx, cb) {
    var n=ifaceIdx+1, sfx=band+"-"+n;
    var enc=document.getElementById("enc-"+sfx).value;
    var enabled=document.getElementById("en-"+sfx).checked;
    var d="save_type=iface"
      +"&band="+encodeURIComponent(band)
      +"&iface_sec="+encodeURIComponent(document.getElementById("h-iface-sec-"+sfx).value)
      +"&ssid="+encodeURIComponent(document.getElementById("ssid-"+sfx).value)
      +"&enc="+encodeURIComponent(enc)
      +"&key="+encodeURIComponent(document.getElementById("key-"+sfx).value)
      +"&hidden="+encodeURIComponent(document.getElementById("hid-"+sfx).value)
      +"&iface_disabled="+(enabled?"0":"1")
      +"&roam="+(document.getElementById("roam-"+sfx)&&document.getElementById("roam-"+sfx).checked?"1":"0")
      +"&isolate="+(document.getElementById("isolate-"+sfx)&&document.getElementById("isolate-"+sfx).checked?"1":"0")
      +"&wnm="+(document.getElementById("wnm-"+sfx)&&document.getElementById("wnm-"+sfx).checked?"1":"0");
    ajax("POST",BASE+"/save_wireless",d,cb);
  }
  function _doDeleteIface(band, ifaceIdx, cb) {
    var sfx=band+"-"+(ifaceIdx+1);
    ajax("POST",BASE+"/delete_iface","iface_sec="+encodeURIComponent(document.getElementById("h-iface-sec-"+sfx).value),cb);
  }

  // ── Public save functions ─────────────────────────────────────────────────────
  function saveIface(band, ifaceIdx) {
    var n=ifaceIdx+1, sfx=band+"-"+n;
    var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
    var label=bandLabel+(_bandCfg[band]&&_bandCfg[band].ifaces&&_bandCfg[band].ifaces.length>1?" SSID "+n:" SSID");
    if(_pendingDelete[sfx]) {
      var deletedSsid=_getFieldVal("ssid-"+sfx);
      showSaving("Deleting "+label+"...","Removing SSID and reloading radio");
      _doDeleteIface(band,ifaceIdx,function(r){
        hideSaving();
        if(r&&r.success){delete _pendingDelete[sfx];var btn=document.getElementById("delbtn-"+sfx);if(btn){var card=btn.closest(".nc-card");if(card)card.remove();}toast("ok","SSID deleted",["\""+deletedSsid+"\" removed"]);}
        else{toast("err",(r&&r.message)||"Delete failed");}
      });
      return;
    }
    if(!_dirty[sfx]){toast("ok","No changes to save");return;}
    var encEl=document.getElementById("enc-"+sfx), keyEl=document.getElementById("key-"+sfx);
    if(encEl&&keyEl&&!_validateIfaceKey(encEl.value,keyEl)) return;

    var overlay = document.getElementById('ssid-confirm-overlay');
    var yesBtn = document.getElementById('ssid-confirm-yes');
    var msgEl = document.getElementById('ssid-confirm-msg');
    if (msgEl) msgEl.textContent = "Clients on SSID: " + _getFieldVal("ssid-" + sfx) + " will briefly disconnect.";
    overlay.classList.add('show');

    yesBtn.onclick = function() {
      overlay.classList.remove('show');
      var snapBefore=_snapshot[sfx]?JSON.parse(JSON.stringify(_snapshot[sfx])):null;
      showSaving("Saving "+label+"...","Applying Wi-Fi config and reloading radio");
      _doSaveIface(band,ifaceIdx,function(r){
        hideSaving();
        if(r&&r.success){var changes=_buildIfaceChanges(sfx,snapBefore);snapshotCard(sfx);markClean(sfx);toast("ok",label+" saved",changes);}
        else{toast("err",(r&&r.message)||"Unknown error");}
      });
    };
  }
  function saveAll(band) {
    var ifaces=(_bandCfg[band]&&_bandCfg[band].ifaces)||[];
    var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
    var anyDirty=false;
    for(var ci=0;ci<ifaces.length;ci++){if(_dirty[band+"-"+(ci+1)]||_pendingDelete[band+"-"+(ci+1)]){anyDirty=true;break;}}
    if(!anyDirty){toast("ok","No changes to save");return;}
    for(var vi=0;vi<ifaces.length;vi++){
      var vsfx=band+"-"+(vi+1); if(_pendingDelete[vsfx]) continue;
      var vcard=document.getElementById("ssid-"+vsfx); if(vcard) vcard=vcard.closest(".nc-card");
      if(vcard&&vcard.hasAttribute("data-new-ssid")) continue;
      var venc=document.getElementById("enc-"+vsfx), vkey=document.getElementById("key-"+vsfx);
      if(venc&&vkey&&!_validateIfaceKey(venc.value,vkey)) return;
    }

    var performSave = function() {
      var allSnaps={};
      for(var si=0;si<ifaces.length;si++){var ssfx=band+"-"+(si+1);allSnaps[ssfx]=_snapshot[ssfx]?JSON.parse(JSON.stringify(_snapshot[ssfx])):null;}
      showSaving("Saving all "+bandLabel+" SSIDs...","Applying SSID config and reloading radio");
      var tasks=[];
      for(var i=0;i<ifaces.length;i++){
        var tsfx=band+"-"+(i+1);
        if(_pendingDelete[tsfx]) tasks.push({type:"delete",idx:i});
        else if(_dirty[tsfx])   tasks.push({type:"iface",idx:i});
      }
      if(!tasks.length){hideSaving();toast("ok","No changes to save");return;}
      var allChanges=[], step=0;
      function next(ok,msg) {
        if(!ok){hideSaving();toast("err",msg||"Save failed");return;}
        if(step>=tasks.length){hideSaving();toast("ok",bandLabel+" SSIDs saved",allChanges);return;}
        var task=tasks[step++];
        if(task.type==="delete") {
          var dsfx=band+"-"+(task.idx+1);
          var deletedSsid=_getFieldVal("ssid-"+dsfx);
          _doDeleteIface(band,task.idx,function(r){
            if(r&&r.success){allChanges.push("\""+deletedSsid+"\" SSID deleted");delete _pendingDelete[dsfx];_dirty[dsfx]=false;var btn=document.getElementById("delbtn-"+dsfx);if(btn){var card=btn.closest(".nc-card");if(card)card.remove();}}
            next(r&&r.success,r&&r.message);
          });
        } else {
          var isfx=band+"-"+(task.idx+1), isnap=allSnaps[isfx];
          _doSaveIface(band,task.idx,function(r){
            if(r&&r.success){var ic=_buildIfaceChanges(isfx,isnap);ic.forEach(function(l){allChanges.push(l);});snapshotCard(isfx);markClean(isfx);}
            next(r&&r.success,r&&r.message);
          });
        }
      }
      next(true);
    };

    var overlay = document.getElementById('ssid-confirm-overlay');
    var yesBtn = document.getElementById('ssid-confirm-yes');
    var msgEl = document.getElementById('ssid-confirm-msg');
    if (msgEl) {
      var names = [];
      for (var i = 0; i < ifaces.length; i++) {
        var tsfx = band + "-" + (i + 1);
        if (_dirty[tsfx]) { var s = _getFieldVal("ssid-" + tsfx); if (s) names.push(s); }
      }
      if (names.length > 0) {
        msgEl.textContent = "Clients on SSID: " + names.join(" and ") + " will briefly disconnect.";
      } else {
        msgEl.textContent = "Applying changes will briefly disconnect clients connected to this SSID.";
      }
    }
    overlay.classList.add('show');
    yesBtn.onclick = function() {
      overlay.classList.remove('show');
      performSave();
    };
  }

  // ── Universal Save & Apply (all bands) ────────────────────────────────────────
  function _doCreateIface(band, ifaceIdx, cb) {
    var n=ifaceIdx+1, sfx=band+"-"+n;
    var radioSec=document.getElementById("h-radio-sec-"+band);
    if(!radioSec||!radioSec.value){cb({success:false,message:"Radio section not found for this band."});return;}
    var d="save_type=new_iface"
      +"&band="+encodeURIComponent(band)
      +"&radio_sec="+encodeURIComponent(radioSec.value)
      +"&ssid="+encodeURIComponent(document.getElementById("ssid-"+sfx).value)
      +"&enc="+encodeURIComponent(document.getElementById("enc-"+sfx).value)
      +"&key="+encodeURIComponent(document.getElementById("key-"+sfx).value)
      +"&hidden="+encodeURIComponent(document.getElementById("hid-"+sfx).value)
      +"&iface_disabled="+(document.getElementById("en-"+sfx).checked?"0":"1")
      +"&roam="+(document.getElementById("roam-"+sfx)&&document.getElementById("roam-"+sfx).checked?"1":"0")
      +"&isolate="+(document.getElementById("isolate-"+sfx)&&document.getElementById("isolate-"+sfx).checked?"1":"0")
      +"&wnm="+(document.getElementById("wnm-"+sfx)&&document.getElementById("wnm-"+sfx).checked?"1":"0");
    ajax("POST",BASE+"/save_wireless",d,cb);
  }
  function anyPendingApsChanges(){
    for(var k in _dirty) if(_dirty[k]) return true;
    for(var k2 in _pendingDelete) if(_pendingDelete[k2]) return true;
    var conts=["2g","5g","5gb","6g"];
    for(var c=0;c<conts.length;c++){
      var cont=document.getElementById("bp-"+conts[c]);
      if(cont&&cont.querySelector(".nc-card.ssid-card[data-new-ssid]")) return true;
    }
    return false;
  }
  function updateUniversalSave(){
    var bar=document.getElementById("universal-save-bar");
    var btn=document.getElementById("usb-apply");
    var status=document.getElementById("usb-status");
    var has=anyPendingApsChanges();
    if(btn) btn.disabled=!has;
    if(status) status.textContent=has?"Unsaved changes":"No changes";
    if(bar) bar.classList.toggle("has-changes",has);
  }
  function saveAllUniversal() {
    var bandsOrder=["2g","5g","5gb","6g"];
    var tasks=[];
    bandsOrder.forEach(function(band){
      var ifaces=(_bandCfg[band]&&_bandCfg[band].ifaces)||[];
      for(var i=0;i<ifaces.length;i++){
        var tsfx=band+"-"+(i+1);
        var card=document.getElementById("ssid-"+tsfx);
        var cardEl=card?card.closest(".nc-card"):null;
        if(cardEl&&cardEl.hasAttribute("data-new-ssid")) tasks.push({type:"create",band:band,idx:i,sfx:tsfx});
        else if(_pendingDelete[tsfx]) tasks.push({type:"delete",band:band,idx:i,sfx:tsfx});
        else if(_dirty[tsfx]) tasks.push({type:"iface",band:band,idx:i,sfx:tsfx,ssid:(_getFieldVal("ssid-"+tsfx)||"")});
      }
    });
    if(!tasks.length){toast("ok","No changes to save");return;}

    for(var v=0;v<tasks.length;v++){
      var t=tasks[v];
      if(t.type==="create"||t.type==="iface"){
        var ssidEl=document.getElementById("ssid-"+t.sfx);
        var encEl=document.getElementById("enc-"+t.sfx);
        var keyEl=document.getElementById("key-"+t.sfx);
        if(!ssidEl||!ssidEl.value.trim()){ if(ssidEl){_setFieldError(ssidEl,"SSID name is required.");ssidEl.focus();} toast("err","SSID name is required"); return; }
        if(encEl&&keyEl&&!_validateIfaceKey(encEl.value,keyEl)) return;
      }
    }

    var overlay=document.getElementById('ssid-confirm-overlay');
    var yesBtn=document.getElementById('ssid-confirm-yes');
    var msgEl=document.getElementById('ssid-confirm-msg');
    if(msgEl){
      var names=[];
      tasks.forEach(function(t){ if((t.type==="iface"||t.type==="create")&&t.ssid) names.push(t.ssid); });
      if(names.length>0) msgEl.textContent="Clients on SSID: "+names.join(" and ")+" will briefly disconnect.";
      else msgEl.textContent="Applying changes will briefly disconnect Wi-Fi clients.";
    }
    overlay.classList.add('show');
    yesBtn.onclick=function(){
      overlay.classList.remove('show');
      showSaving("Saving all changes...","Applying Wi-Fi config and reloading radio");
      var allChanges=[], step=0;
      function next(ok,msg){
        if(!ok){hideSaving();toast("err",msg||"Save failed");return;}
        if(step>=tasks.length){hideSaving();toast("ok","All changes saved",allChanges);loadConfig();return;}
        var task=tasks[step++];
        if(task.type==="delete"){
          _doDeleteIface(task.band,task.idx,function(r){
            if(r&&r.success) allChanges.push("SSID removed");
            next(r&&r.success,r&&r.message);
          });
        } else if(task.type==="create"){
          _doCreateIface(task.band,task.idx,function(r){
            if(r&&r.success) allChanges.push("SSID \""+(_getFieldVal("ssid-"+task.sfx)||"")+"\" added");
            next(r&&r.success,r&&r.message);
          });
        } else {
          _doSaveIface(task.band,task.idx,function(r){
            if(r&&r.success){var ic=_buildIfaceChanges(task.sfx,_snapshot[task.sfx]);ic.forEach(function(l){allChanges.push(l);});}
            next(r&&r.success,r&&r.message);
          });
        }
      }
      next(true);
    };
  }

  // ── Add / Cancel new SSID ─────────────────────────────────────────────────────
  function addSsid(band) {
    var container=document.getElementById("bp-"+band); if(!container) return;
    var addRow=container.querySelector("[data-add-ssid-row]");
    var existing=container.querySelectorAll(".ssid-card").length;
    var n=existing+1, sfx=band+"-"+n;
    var card=document.createElement("div");
    card.className="nc-card ssid-card wl-focus"; card.setAttribute("data-new-ssid","1");
    card.innerHTML=
      '<div class="nc-card-head head-new-ssid">'+
        '<div class="nc-card-head-left"><h2>New SSID</h2></div>'+
        '<div class="nc-card-head-right"><div class="tog-wrap"><span class="tog-lbl">Enable</span>'+
          '<label class="toggle"><input type="checkbox" id="en-'+sfx+'" checked onchange="dimCard(\'body-'+sfx+'\',!this.checked)">'+
          '<div class="tog-track"></div><div class="tog-thumb"></div></label></div></div>'+
      '</div>'+
      '<div class="nc-card-body" id="body-'+sfx+'">'+
        '<input type="hidden" id="h-iface-sec-'+sfx+'" value="">'+
        '<div class="fg">'+
          '<div class="nf"><label>SSID (Network Name) <span style="color:#e05a52">*</span></label>'+
            '<input type="text" id="ssid-'+sfx+'" maxlength="32" placeholder="My WiFi '+n+'" oninput="this.classList.remove(\'field-error\');var e=this.parentNode.querySelector(\'.field-error-msg\');if(e)e.remove()"></div>'+
          '<div class="nf"><label>Broadcast SSID</label>'+
            '<select id="hid-'+sfx+'"><option value="0">Yes (Visible)</option><option value="1">No (Hidden)</option></select></div>'+
          '<div class="nf"><label>Security</label>'+
            '<select id="enc-'+sfx+'" onchange="toggleKey(\'kw-'+sfx+'\',this.value)">'+
              _encOpts("none")+'</select></div>'+
          '<div class="nf" id="kw-'+sfx+'" style="display:none"><label>Password</label>'+
            '<div class="pw-wrap"><input type="password" id="key-'+sfx+'" placeholder="Min 8 chars" autocomplete="new-password"'+
              ' oninput="this.classList.remove(\'field-error\');var e=this.parentNode.querySelector(\'.field-error-msg\');if(e)e.remove()">'+
              '<button class="pw-eye" onclick="toggleEye(this,\'key-'+sfx+'\')" type="button" aria-label="Show password">'+EYE_ON+EYE_OFF+'</button></div></div>'+
        '</div>'+
      '</div>'+
      '<div class="radio-card-divider"><div class="extra-opt-toggle" onclick="toggleExtraOptions(\''+sfx+'\')">Extra Options <span id="extra-opt-chevron-'+sfx+'" class="extra-opt-chevron">'+CHEVRON_DOWN+'</span></div></div>'+
      '<div id="extra-opt-'+sfx+'" class="extra-opt-content"><div class="extra-opt-inner">'+
        '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Client Isolation</div>'+
          '<div class="guest-opt-desc">Restricts connected clients from communicating with each other. Enhances security by isolating peer-to-peer traffic on the same wireless network.</div>'+
          '<div class="guest-opt-note">Note: Disables local network discovery and peer-to-peer resource sharing (e.g., AirDrop, Chromecast, Printer sharing).</div></div>'+
          '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="isolate-'+sfx+'"><div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
        '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Roaming Assist</div>'+
          '<div class="guest-opt-desc">Optimizes client steering using 802.11k/v neighbor reports and BSS transitions. Facilitates faster, intelligent handoffs between APs.</div>'+
          '<div class="guest-opt-note">Note: Improves roaming performance for compatible mobile devices and Mesh systems.</div></div>'+
          '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="roam-'+sfx+'"><div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
        '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Power Saving</div>'+
          '<div class="guest-opt-desc">Implements WNM Sleep Mode to reduce signaling overhead. Extends battery life for connected mobile and IoT devices.</div>'+
          '<div class="guest-opt-caution">Caution: May cause connectivity issues or increased latency on some legacy hardware.</div></div>'+
          '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="wnm-'+sfx+'"><div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
      '</div></div>'+
      '<div class="nc-actions">'+
        '<button class="nc-btn btn-sec" onclick="cancelNewSsid(this)" type="button">Cancel</button>'+
      '</div>';
    if(addRow) container.insertBefore(card,addRow);
    else container.appendChild(card);
    if(!_bandCfg[band]) _bandCfg[band]={ifaces:[]};
    while(_bandCfg[band].ifaces.length<n) _bandCfg[band].ifaces.push({});
    upgradeSelects(card); toggleKey("kw-"+sfx,"none");
    updateUniversalSave();
  }
  function cancelNewSsid(btn) { var card=btn.closest(".nc-card"); if(card) card.remove(); updateUniversalSave(); }
  function saveNewSsid(band, ifaceIdx) {
    var n=ifaceIdx+1, sfx=band+"-"+n;
    var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
    var radioSec=document.getElementById("h-radio-sec-"+band);
    if(!radioSec||!radioSec.value){toast("err","Radio section not found for this band.");return;}
    var ssidEl=document.getElementById("ssid-"+sfx);
    var ssid=ssidEl.value.trim();
    if(!ssid){_setFieldError(ssidEl,"SSID name is required.");ssidEl.focus();return;}
    var enc=document.getElementById("enc-"+sfx).value;
    var keyEl=document.getElementById("key-"+sfx);
    if(!_validateIfaceKey(enc,keyEl)) return;
    var hid=document.getElementById("hid-"+sfx).value;
    var en=document.getElementById("en-"+sfx).checked;
    var d="save_type=new_iface"
      +"&band="+encodeURIComponent(band)
      +"&radio_sec="+encodeURIComponent(radioSec.value)
      +"&ssid="+encodeURIComponent(ssid)
      +"&enc="+encodeURIComponent(enc)
      +"&key="+encodeURIComponent(keyEl.value)
      +"&hidden="+encodeURIComponent(hid)
      +"&iface_disabled="+(en?"0":"1")
      +"&roam="+(document.getElementById("roam-"+sfx)&&document.getElementById("roam-"+sfx).checked?"1":"0")
      +"&isolate="+(document.getElementById("isolate-"+sfx)&&document.getElementById("isolate-"+sfx).checked?"1":"0")
      +"&wnm="+(document.getElementById("wnm-"+sfx)&&document.getElementById("wnm-"+sfx).checked?"1":"0");
    showSaving("Adding "+bandLabel+" SSID...","Creating new SSID");
    ajax("POST",BASE+"/save_wireless",d,function(r){
      hideSaving();
      if(r&&r.success) {
        var hidEl=document.getElementById("h-iface-sec-"+sfx);
        if(hidEl&&r.iface_sec) hidEl.value=r.iface_sec;
        var card=document.getElementById("savebtn-"+sfx).closest(".nc-card");
        card.removeAttribute("data-new-ssid");
        var cardHead=card.querySelector(".nc-card-head");
        if(cardHead) cardHead.classList.remove("head-new-ssid");
        var actions=card.querySelector(".nc-actions");
        if(actions) {
          actions.innerHTML=
            '<button class="btn-delete-iface" id="delbtn-'+sfx+'" onclick="markDeleteIface(\''+band+'\','+(n-1)+')" type="button" style="margin-right:auto">Remove</button>'+
            '<button class="nc-btn btn-wl" id="savebtn-'+sfx+'" onclick="saveIface(\''+band+'\','+(n-1)+')" disabled>Save</button>';
        }
        snapshotCard(sfx); toast("ok","SSID added.");
      } else { toast("err",(r&&r.message)||"Failed to add SSID"); }
    });
  }

  // ── Build read-only Smart AP card (configured from the Smart AP page) ─────────
  function escapeHtml(s) {
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  var _saEncLabels={none:"Open",psk:"WPA",psk2:"WPA2","psk-mixed":"WPA/WPA2",sae:"WPA3"};
  function buildSmartApCard(band, ifd, n) {
    var encLabel=_saEncLabels[ifd.enc||"psk2"]||(ifd.enc||"psk2");
    var hiddenLabel=ifd.hidden==="1"?"Hidden":"Visible";
    var statusLabel=ifd.disabled==="1"?"Disabled":"Enabled";
    var card=document.createElement("div");
    card.className="nc-card ssid-card smart-ap-card";
    card.innerHTML=
      '<div class="nc-card-head">'+
        '<div class="nc-card-head-left"><h2>Smart AP: '+(ifd.ssid||("SSID "+n))+'</h2></div>'+
        '<div class="nc-card-head-right"><span class="smart-ap-badge">Smart AP</span></div>'+
      '</div>'+
      '<div class="nc-card-body">'+
        '<div class="smart-ap-note"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'+
          '<span>This SSID is managed by Smart AP and can only be configured from the Smart AP page.</span></div>'+
        '<div class="smart-ap-info">'+
          '<div class="sa-info-row"><span class="sa-info-lbl">SSID</span><span class="sa-info-val">'+escapeHtml(ifd.ssid||"")+'</span></div>'+
          '<div class="sa-info-row"><span class="sa-info-lbl">Security</span><span class="sa-info-val">'+encLabel+'</span></div>'+
          '<div class="sa-info-row"><span class="sa-info-lbl">Broadcast</span><span class="sa-info-val">'+hiddenLabel+'</span></div>'+
          '<div class="sa-info-row"><span class="sa-info-lbl">Status</span><span class="sa-info-val">'+statusLabel+'</span></div>'+
        '</div>'+
      '</div>'+
      '<div class="nc-actions">'+
        '<button class="btn-smart-configure" type="button" onclick="goSmartAp()">'+
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="19" x2="19" y2="19"/></svg>'+
          'Configure in Smart AP</button>'+
      '</div>';
    return card;
  }
  function goSmartAp() {
    var base=window.location.pathname.replace(/\/(aps|radio|smart_ap|guest)\/?$/, "");
    window.location.href=base+"/smart_ap";
  }

  // ── buildBandPanel (SSID cards only) ──────────────────────────────────────────
  function buildBandPanel(band, wData) {
    var container=document.getElementById("bp-"+band); if(!container) return;
    container.innerHTML="";
    // Hidden radio section reference — needed to create new SSIDs on the right radio.
    var radioSecInput=document.createElement("input");
    radioSecInput.type="hidden"; radioSecInput.id="h-radio-sec-"+band; radioSecInput.value=wData.radio_sec||"";
    container.appendChild(radioSecInput);

    // Split regular (editable) and Smart AP (read-only) SSIDs.
    var allIfaces=wData.ifaces||[];
    var regularIfaces=[];
    var smartIfaces=[];
    allIfaces.forEach(function(ifd){
      if(ifd.is_smart_ap==="1") smartIfaces.push(ifd);
      else regularIfaces.push(ifd);
    });
    wData.ifaces=regularIfaces;

    regularIfaces.forEach(function(ifd,idx){
      var n=idx+1, sfx=band+"-"+n;
      var card=document.createElement("div");
      card.className="nc-card ssid-card wl-focus";
      card.innerHTML=
        '<div class="nc-card-head">'+
          '<div class="nc-card-head-left"><h2>SSID: '+(ifd.ssid || 'SSID ' + n)+'</h2></div>'+
          '<div class="nc-card-head-right"><div class="tog-wrap"><span class="tog-lbl">Enable</span>'+
            '<label class="toggle"><input type="checkbox" id="en-'+sfx+'" onchange="dimCard(\'body-'+sfx+'\',!this.checked);markDirty(\''+sfx+'\')">'+
            '<div class="tog-track"></div><div class="tog-thumb"></div></label></div></div>'+
        '</div>'+
        '<div class="nc-card-body" id="body-'+sfx+'">'+
          '<input type="hidden" id="h-iface-sec-'+sfx+'" value="">'+
          (ifd.iface_sec&&!ifd.network?'<div class="card-error-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> No Interface Assigned</div>':'')+
          '<div class="fg" onchange="markDirty(\''+sfx+'\')" oninput="markDirty(\''+sfx+'\')">'+
            '<div class="nf"><label>SSID (Network Name) <span style="color:#e05a52">*</span></label>'+
              '<input type="text" id="ssid-'+sfx+'" maxlength="32" placeholder="My WiFi"></div>'+
            '<div class="nf"><label>Broadcast SSID</label>'+
              '<select id="hid-'+sfx+'"><option value="0">Yes (Visible)</option><option value="1">No (Hidden)</option></select></div>'+
            '<div class="nf"><label>Security</label>'+
              '<select id="enc-'+sfx+'" onchange="toggleKey(\'kw-'+sfx+'\',this.value)">'+
                _encOpts(ifd.enc||"none")+'</select></div>'+
            '<div class="nf" id="kw-'+sfx+'"><label>Password</label>'+
              '<div class="pw-wrap">'+
                '<input type="password" id="key-'+sfx+'" placeholder="Min 8 chars" autocomplete="new-password"'+
                  ' oninput="this.classList.remove(\'field-error\');var e=this.parentNode.querySelector(\'.field-error-msg\');if(e)e.remove()">'+
                '<button class="pw-eye" onclick="toggleEye(this,\'key-'+sfx+'\')" type="button" aria-label="Show password">'+EYE_ON+EYE_OFF+'</button></div></div>'+
          '</div>'+
          '</div>'+
          '<div class="radio-card-divider"><div class="extra-opt-toggle" onclick="toggleExtraOptions(\''+sfx+'\')">Extra Options <span id="extra-opt-chevron-'+sfx+'" class="extra-opt-chevron">'+CHEVRON_DOWN+'</span></div></div>'+
          '<div id="extra-opt-'+sfx+'" class="extra-opt-content"><div class="extra-opt-inner">'+
          '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Client Isolation</div>'+
            '<div class="guest-opt-desc">Restricts connected clients from communicating with each other. Enhances security by isolating peer-to-peer traffic on the same wireless network.</div>'+
            '<div class="guest-opt-note">Note: Disables local network discovery and peer-to-peer resource sharing (e.g., AirDrop, Chromecast, Printer sharing).</div></div>'+
            '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="isolate-'+sfx+'" onchange="markDirty(\''+sfx+'\')">'+
            '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
          '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Roaming Assist</div>'+
            '<div class="guest-opt-desc">Optimizes client steering using 802.11k/v neighbor reports and BSS transitions. Facilitates faster, intelligent handoffs between APs.</div>'+
            '</div>'+
            '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="roam-'+sfx+'" onchange="markDirty(\''+sfx+'\')">'+
            '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
          '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Power Saving</div>'+
            '<div class="guest-opt-desc">Implements WNM Sleep Mode to reduce signaling overhead. Extends battery life for connected mobile and IoT devices.</div>'+
            '<div class="guest-opt-caution">Caution: May cause connectivity issues or increased latency on some legacy hardware.</div></div>'+
            '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="wnm-'+sfx+'" onchange="markDirty(\''+sfx+'\')">'+
            '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
          '</div></div>'+
        '<div class="pending-delete-notice">This SSID will be deleted on next save.</div>'+
        '<div class="nc-actions">'+
          '<button class="btn-delete-iface" id="delbtn-'+sfx+'" onclick="markDeleteIface(\''+band+'\','+idx+')" type="button" style="margin-right:auto">Remove</button>'+
        '</div>';
      container.appendChild(card);
      setVal("h-iface-sec-"+sfx,ifd.iface_sec); setVal("ssid-"+sfx,ifd.ssid); setVal("key-"+sfx,ifd.key);
      selVal("enc-"+sfx,ifd.enc||"psk2"); selVal("hid-"+sfx,ifd.hidden||"0");
      setChk("en-"+sfx,ifd.disabled!=="1"); dimCard("body-"+sfx,ifd.disabled==="1");
      toggleKey("kw-"+sfx,ifd.enc||"psk2");
      setChk("roam-"+sfx,ifd.bss_transition==="1"||ifd.ieee80211k==="1");
      setChk("isolate-"+sfx,ifd.isolate==="1"); setChk("wnm-"+sfx,ifd.wnm_sleep_mode==="1");
      snapshotCard(sfx);
    });

    // Read-only Smart AP SSID cards (configured from the Smart AP page).
    smartIfaces.forEach(function(ifd,idx){
      var card=buildSmartApCard(band,ifd,idx+1);
      if(card) container.appendChild(card);
    });

    // Add SSID button row
    var addSsidRow=document.createElement("div");
    addSsidRow.style.cssText="display:flex;justify-content:flex-start;margin-bottom:10px";
    addSsidRow.setAttribute("data-add-ssid-row","1");
    addSsidRow.innerHTML='<button class="nc-btn btn-add" onclick="addSsid(\''+band+'\')" type="button" style="gap:6px">'+
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add SSID</button>';
    container.appendChild(addSsidRow);

    upgradeSelects(container);
    regularIfaces.forEach(function(ifd,idx){ snapshotCard(band+"-"+(idx+1)); });
    updateUniversalSave();
  }

  // ── Custom select engine ──────────────────────────────────────────────────────
  var _openCsel=null;
  document.addEventListener("click",function(e){
    if(!_openCsel) return;
    var list=document.getElementById(_openCsel.listId);
    if(list&&list.contains(e.target)) return;
    if(_openCsel.trigger.contains(e.target)) return;
    cselCloseAll();
  });
  document.addEventListener("touchend",function(e){
    if(!_openCsel) return;
    var list=document.getElementById(_openCsel.listId);
    if(list&&list.contains(e.target)) return;
    if(_openCsel.trigger.contains(e.target)) return;
    cselCloseAll();
  },true);
  function cselCloseAll(){
    if(!_openCsel) return;
    _openCsel.trigger.classList.remove("open");
    var list=document.getElementById(_openCsel.listId);
    if(list){list.classList.remove("open","flip-up");}
    _openCsel=null;
  }
  function _cselPosition(trigger,list){
    var rect=trigger.getBoundingClientRect();
    var vw=window.innerWidth, vh=window.innerHeight;
    var navbarEl=document.querySelector(".luci-navbar,#navbar,nav.navbar,header.navbar");
    var NAVBAR_BOTTOM=navbarEl?navbarEl.getBoundingClientRect().bottom:52;
    var TOP_CLEARANCE=Math.max(NAVBAR_BOTTOM+4,56);
    var listMinW=list.dataset.minw?parseInt(list.dataset.minw):160;
    var listW=Math.max(rect.width,listMinW);
    var left=rect.left;
    if(left+listW>vw-8) left=vw-listW-8;
    if(left<8) left=8;
    list.style.width=listW+"px"; list.style.left=left+"px"; list.style.top=""; list.style.bottom="";
    list.classList.remove("flip-up");
    var spaceBelow=vh-rect.bottom-8, spaceAbove=rect.top-TOP_CLEARANCE, maxH=220;
    if(spaceBelow>=80||spaceBelow>=spaceAbove){
      list.style.top=(rect.bottom+4)+"px"; list.style.maxHeight=Math.min(maxH,spaceBelow)+"px";
    } else {
      list.classList.add("flip-up");
      var allowedUp=Math.min(maxH,spaceAbove);
      var listTop=rect.top-4-allowedUp;
      if(listTop<TOP_CLEARANCE){list.classList.remove("flip-up");list.style.top=(rect.bottom+4)+"px";list.style.maxHeight=Math.min(maxH,spaceBelow)+"px";}
      else{list.style.bottom=(vh-rect.top+4)+"px";list.style.maxHeight=allowedUp+"px";}
    }
  }
  window.addEventListener("scroll",function(e){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(list&&list.contains(e.target))return;cselCloseAll();},true);
  window.addEventListener("resize",function(){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(!list)return;_cselPosition(_openCsel.trigger,list);});
  function upgradeSelects(root){
    var selects=(root||document).querySelectorAll(".nf select:not([data-csu])");
    selects.forEach(function(sel){
      sel.setAttribute("data-csu","1");
      var nf=sel.closest('.nf'); if(nf) nf.classList.add('nf-has-select');
      sel.style.display="none";
      var wrap=document.createElement("div"); wrap.className="csel-wrap";
      sel.parentNode.insertBefore(wrap,sel); wrap.appendChild(sel);
      var trigger=document.createElement("div"); trigger.className="csel";
      trigger.innerHTML='<span class="csel-val"></span>'+CHEVRON;
      wrap.appendChild(trigger);
      var listId="csel-"+Math.random().toString(36).slice(2,9);
      var list=document.createElement("div"); list.className="csel-list";
      if(sel.closest(".ssid-card")) list.classList.add("csel-blue");
      list.id=listId; list.style.position="fixed"; list.style.zIndex="99";
      document.body.appendChild(list);
      function _renderOpts(filter){
        Array.from(list.querySelectorAll(".csel-opt,.csel-no-results")).forEach(function(e){e.remove();});
        var q=(filter||"").toLowerCase().trim(); var shown=0;
        Array.from(sel.options).forEach(function(opt){
          if(q&&opt.textContent.toLowerCase().indexOf(q)===-1&&opt.value.toLowerCase().indexOf(q)===-1) return;
          var d=document.createElement("div"); d.className="csel-opt"; d.dataset.val=opt.value; d.textContent=opt.textContent;
          if(opt.selected) d.classList.add("selected");
          d.addEventListener("click",function(e){e.stopPropagation();sel.value=opt.value;sel.dispatchEvent(new Event("change",{bubbles:true}));syncDisplay();cselCloseAll();});
          list.appendChild(d); shown++;
        });
        if(!shown){var nr=document.createElement("div");nr.className="csel-no-results";nr.textContent="No results";list.appendChild(nr);}
      }
      function buildList(){
        list.innerHTML="";
        _renderOpts("");
      }
      function syncDisplay(){
        var opt=sel.options[sel.selectedIndex]; var sp=trigger.querySelector(".csel-val");
        if(sp) sp.textContent=opt?opt.textContent:"";
        list.querySelectorAll(".csel-opt").forEach(function(o){o.classList.toggle("selected",o.dataset.val===sel.value);});
      }
      buildList(); syncDisplay();
      sel._cselSync=syncDisplay;
      sel._cselRebuild=function(){buildList();syncDisplay();};
      trigger.addEventListener("click",function(e){
        e.stopPropagation();
        if(_openCsel&&_openCsel.trigger!==trigger) cselCloseAll();
        if(list.classList.contains("open")){cselCloseAll();return;}
        var wrap2=document.querySelector(".nc-wrap");
        var isLight=wrap2&&wrap2.classList.contains("theme-light");
        list.classList.toggle("theme-light",!!isLight);
        _cselPosition(trigger,list);
        trigger.classList.add("open"); list.classList.add("open");
        _openCsel={trigger:trigger,listId:listId};
        var sel2=list.querySelector(".csel-opt.selected");
        if(sel2) setTimeout(function(){sel2.scrollIntoView({block:"nearest"});},0);
      });
    });
  }

  // ── AJAX + Toast ──────────────────────────────────────────────────────────────
  function ajax(method, url, body, cb) {
  return EasySetup.ajax(method, url, body, cb);
}

  var _bannerTimer=null;
  function toast(type,msg,lines){
    var overlay=document.getElementById("toast-overlay");
    var iconWrap=document.getElementById("toast-overlay-icon");
    var svg=document.getElementById("toast-overlay-svg");
    var textEl=document.getElementById("toast-overlay-text");
    var listEl=document.getElementById("toast-overlay-changes");
    if(!overlay) return;
    if(_bannerTimer){clearTimeout(_bannerTimer);_bannerTimer=null;}
    textEl.textContent=msg||(type==="ok"?"Done":"An error occurred");
    iconWrap.className="toast-overlay-icon "+type;
    svg.innerHTML=type==="ok"?'<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>'
      :'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    svg.style.stroke=type==="ok"?"#43e895":"#e05a52";
    listEl.innerHTML="";
    if(lines&&lines.length){lines.forEach(function(line){var li=document.createElement("li");li.textContent=line;if(type==="err")li.className="err-line";listEl.appendChild(li);});listEl.style.display="";}
    else{listEl.style.display="none";}
    overlay.classList.add("show");
    var delay=lines&&lines.length?Math.min(3000+lines.length*600,7000):3000;
    _bannerTimer=setTimeout(function(){dismissBanner();},delay);
  }
  function dismissBanner(){
    var overlay=document.getElementById("toast-overlay"); if(overlay) overlay.classList.remove("show");
    if(_bannerTimer){clearTimeout(_bannerTimer);_bannerTimer=null;}
  }
  function showSaving(text,sub){
    document.getElementById("save-overlay-text").textContent=text||"Saving...";
    document.getElementById("save-overlay-sub").textContent=sub||"Please wait";
    document.getElementById("save-overlay").classList.add("show");
  }
  function hideSaving(){ document.getElementById("save-overlay").classList.remove("show"); }

  // ── Load config ───────────────────────────────────────────────────────────────
  function loadConfig(){
    ajax("GET",BASE+"/get_ap_config",null,function(cfg){
      if(!cfg||cfg.error){toast("err",(cfg&&cfg.error)||"Failed to load config");return;}
      _wpa3Supported = !!cfg.wpa3_supported;

      // Build a set of SSIDs that are Smart AP candidates to hide them
      var smartSsidSet = {};
      if (cfg.smart_candidates) {
        cfg.smart_candidates.forEach(function(c) {
          smartSsidSet[c.ssid] = true;
        });
      }

      var bandMap=[{cfgKey:"w2",uiKey:"2g"},{cfgKey:"w5",uiKey:"5g"},{cfgKey:"w5b",uiKey:"5gb"},{cfgKey:"w6",uiKey:"6g"}];
      var firstBand=null;
      bandMap.forEach(function(bm){
        var wData=cfg[bm.cfgKey]; if(!wData) { if(bm.uiKey!=="2g"&&bm.uiKey!=="5g"){var t=document.getElementById("tab-"+bm.uiKey);if(t)t.style.display="none";} return; }
        if(bm.uiKey!=="2g"&&bm.uiKey!=="5g"){var t2=document.getElementById("tab-"+bm.uiKey);if(t2)t2.style.display="";}

        // Filter out candidate Smart APs (already-configured Smart APs are shown
        // read-only on this page via the is_smart_ap flag).
        if (wData.ifaces) {
          wData.ifaces = wData.ifaces.filter(function(ifd) {
            return !smartSsidSet[ifd.ssid];
          });
        }

        _bandCfg[bm.uiKey]=wData;
        buildBandPanel(bm.uiKey,wData);
        if(!firstBand) firstBand=bm.uiKey;
      });
      if(firstBand) switchBand(firstBand,document.getElementById("tab-"+firstBand));
    });
  }

  loadConfig();
