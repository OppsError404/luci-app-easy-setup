  var BASE = window.location.pathname.replace(/\/radio\/?$/, "");

  var CHEVRON = '<svg class="csel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  var _activeBand = "2g";
  var _bandCfg    = {};
  var _radioCaps = {};
  var _radioCapsReady = false;
  var _radioCapWait = {};
  var _hwHtmodes  = {};
  var WL_WIDTH_LABELS = {"20":"20 MHz","40":"40 MHz","80":"80 MHz","160":"160 MHz","320":"320 MHz"};
  var GEN_ORDER  = ["legacy","11n","11ac","11ax","11be"];
  var GEN_PREFIX = {"legacy":"NOHT","11n":"HT","11ac":"VHT","11ax":"HE","11be":"EHT"};

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
  function selVal(id, v)  {
    var e=document.getElementById(id); if(!e) return;
    for(var i=0;i<e.options.length;i++) if(e.options[i].value===v){e.selectedIndex=i;break;}
    if(e._cselSync) e._cselSync();
  }

  // ── Country helpers ───────────────────────────────────────────────────────────
  function buildCountryOptions(sel, countries, selected) {
    sel.innerHTML='<option value="">- Unset -</option>';
    countries.forEach(function(c){
      var o=document.createElement("option");
      o.value=c[0]; o.textContent=c[1];
      if(c[0]===selected) o.selected=true;
      sel.appendChild(o);
    });
    if(sel._cselRebuild) sel._cselRebuild();
  }
  function toggleCustomCountry(customId, val) {
    var box=document.getElementById(customId);
    if(box) box.style.display=(val==="OTHER"?"inline-block":"none");
  }
  function getCountryVal(selId, customId) {
    var sel=document.getElementById(selId); if(!sel) return "";
    if(sel.value==="OTHER") { var box=document.getElementById(customId); return box?box.value.toUpperCase().trim():""; }
    return sel.value;
  }

  // ── Band label / width helpers ────────────────────────────────────────────────
  function genBandLabel(gen, band) {
    var map2g={legacy:"B/G","11n":"B/G/N","11ax":"AX","11be":"BE"};
    var map5g={legacy:"A","11n":"A/N","11ac":"A/N/AC","11ax":"AX","11be":"BE"};
    var map6g={"11ax":"AX","11be":"BE"};
    if(band==="2g") return map2g[gen]||gen.toUpperCase();
    if(band==="6g") return map6g[gen]||gen.toUpperCase();
    return map5g[gen]||gen.toUpperCase();
  }
  function updateBandLabel(band, gen) {
    if(!gen||gen===""||gen==="nil") return;
    var t=document.getElementById("tab-"+band); if(!t) return;
    var prefix=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
    var normBand=(band==="5gb")?"5g":band;
    t.textContent=prefix+" - "+genBandLabel(gen,normBand);
  }
  function capModeSelect(selId, hwMaxGen) {
    if(!hwMaxGen||hwMaxGen===""||hwMaxGen==="nil") return;
    var maxIdx=GEN_ORDER.indexOf(hwMaxGen); if(maxIdx<0) return;
    var sel=document.getElementById(selId); if(!sel) return;
    for(var i=sel.options.length-1;i>=0;i--) { if(GEN_ORDER.indexOf(sel.options[i].value)>maxIdx) sel.remove(i); }
    if(sel._cselRebuild) sel._cselRebuild();
  }
  function syncWidth(band, gen, keepHtmode) {
    var sel=document.getElementById("ht-"+band); if(!sel) return;
    var keep=keepHtmode||sel.value;
    sel.innerHTML="";
    if(!gen||gen==="legacy") {
      var o=document.createElement("option"); o.value="NOHT"; o.textContent="20 MHz (no HT)"; sel.appendChild(o); return;
    }
    var prefix=GEN_PREFIX[gen]||"";
    var allModes=_hwHtmodes[band]||[];
    var opts=[];
    if(allModes.length) { allModes.forEach(function(h){ if(h.toUpperCase().indexOf(prefix)===0) opts.push(h); }); }
    if(!opts.length) {
      var fallback={"11n":["HT20","HT40"],"11ac":["VHT20","VHT40","VHT80"],"11ax":["HE20","HE40","HE80"],"11be":["EHT20","EHT40","EHT80"]};
      opts=fallback[gen]||["HT20"];
    }
    // Capability RPC may arrive after config, or omit modes for an inactive
    // radio. Keep the configured width instead of silently selecting 80 MHz.
    var keptMode=keep.replace(/_FORCE$/,"");
    if(keptMode.indexOf(prefix)===0&&
       /^(HT(20|40)|VHT(20|40|80|160|80\+80)|HE(20|40|80|160|80\+80)|EHT(20|40|80|160|320))$/.test(keptMode)&&
       (band!=="2g"||/^(HT|HE|EHT)(20|40)$/.test(keptMode))&&opts.indexOf(keptMode)===-1) opts.push(keptMode);
    var matched=false;
    opts.forEach(function(v){
      var num=(v.match(/\d+/)||["20"])[0];
      var o=document.createElement("option");
      var is2g=(band==="2g");
      var widthLabel=(is2g&&num==="40")?"20 / 40 MHz (Auto)":(WL_WIDTH_LABELS[num]||(num+" MHz"));
      o.value=v; o.textContent=widthLabel;
      if(v===keep){o.selected=true;matched=true;}
      sel.appendChild(o);
      if(is2g&&num==="40") {
        var fv=v+"_FORCE";
        var of=document.createElement("option");
        of.value=fv; of.textContent="40 MHz (Force)";
        if(fv===keep){of.selected=true;matched=true;}
        sel.appendChild(of);
      }
    });
    if(!matched) sel.options[sel.options.length-1].selected=true;
    if(sel._cselRebuild) sel._cselRebuild();
  }
  function buildTxPowerOptions(pwrSel, txpower_list, curPwr) {
    if(!pwrSel) return;
    var curStr=String(curPwr||"");
    pwrSel.innerHTML='<option value="">Auto (Max)</option>';
    if(!txpower_list||!txpower_list.length) return;
    var maxDbm=txpower_list[0], minDbm=txpower_list[txpower_list.length-1];
    var range=maxDbm-minDbm;
    var tiers=[{pct:100,label:"100% High"},{pct:75,label:"75%"},{pct:50,label:"50%"},{pct:25,label:"25% Low"}];
    var seen={}, matched=false;
    tiers.forEach(function(t){
      var target=maxDbm-(range*(100-t.pct)/100);
      var best=txpower_list.reduce(function(a,b){return Math.abs(b-target)<Math.abs(a-target)?b:a;});
      if(seen[best]) return;
      seen[best]=true;
      var o=document.createElement("option");
      o.value=String(best); o.textContent=t.label+"  ("+best+" dBm)";
      if(o.value===curStr){o.selected=true;matched=true;}
      pwrSel.appendChild(o);
    });
    if(curStr&&!matched) pwrSel.value="";
    if(pwrSel._cselRebuild) pwrSel._cselRebuild();
  }
  function rebuildChannels(band, currentCh, wantedPwr) {
    var radioInput=document.getElementById("h-radio-sec-"+band);
    var radio=radioInput?radioInput.value:(band==="2g"?"radio0":band==="5g"?"radio1":band==="5gb"?"radio2":"radio3");
    var sel=document.getElementById("ch-"+band); if(!sel) return;
    sel.dataset.uciChannel=currentCh||"auto";
    var keep=currentCh||sel.value;
    if(wantedPwr===undefined) { var _p=document.getElementById("pwr-"+band); wantedPwr=_p?_p.value:""; }
    sel.disabled=true;
    function applyCapabilities(r){
      sel.disabled=false;
      if(!r||!r.channels||!r.channels.length) return;
      if(r.hw_max){
        if(_bandCfg[band]) _bandCfg[band].hw_max=r.hw_max;
        capModeSelect("hw-"+band,r.hw_max);
        updateBandLabel(band,r.hw_max);
      }
      if(r.htmodes&&r.htmodes.length) {
        _hwHtmodes[band]=r.htmodes;
        var curGen=document.getElementById("hw-"+band);
        var curHt=document.getElementById("ht-"+band);
        syncWidth(band,curGen?curGen.value:null,curHt?curHt.value:null);
      }
      if(r.txpower_list&&r.txpower_list.length) buildTxPowerOptions(document.getElementById("pwr-"+band),r.txpower_list,wantedPwr);
      var NON_OVERLAP_2G={"1":true,"6":true,"11":true};
      var autoLabel="Auto";
      if(r.active_channel) autoLabel="Auto  (Ch "+r.active_channel+")";
      sel.innerHTML='<option value="auto">'+autoLabel+'</option>';
      var matched=false;
      r.channels.forEach(function(c){
        var o=document.createElement("option");
        o.value=String(c.channel);
        var lbl="Ch "+c.channel+"  ("+c.mhz+" MHz)";
        if(c.dfs) lbl+="  DFS";
        if(band==="2g"&&NON_OVERLAP_2G[String(c.channel)]) lbl="★ "+lbl;
        o.textContent=lbl;
        if(o.value===String(keep)){o.selected=true;matched=true;}
        sel.appendChild(o);
      });
      if(!matched) sel.value="auto";
      if(sel._cselRebuild) sel._cselRebuild();
    }
    if(currentCh!==undefined&&_radioCaps[radio]) { applyCapabilities(_radioCaps[radio]); return; }
    if(currentCh!==undefined&&!_radioCapsReady) {
      _radioCapWait[radio]={band:band,currentCh:currentCh,wantedPwr:wantedPwr};
      return;
    }
    ajax("GET",BASE+"/get_channels?radio="+radio,null,applyCapabilities);
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  var _dirty = {};
  var _snapshot = {};

  function _getFieldVal(id) {
    var el=document.getElementById(id); if(!el) return null;
    if(el.type==="checkbox") return el.checked;
    return el.value;
  }
  function snapshotCard(band) {
    var snap={};
    snap.ch=_getFieldVal("ch-"+band); snap.ht=_getFieldVal("ht-"+band);
    snap.hw=_getFieldVal("hw-"+band); snap.pwr=_getFieldVal("pwr-"+band);
    snap.country=_getFieldVal("country-"+band); snap.countryCustom=_getFieldVal("country-"+band+"-custom");
    _snapshot["radio-"+band]=snap;
  }
  function _cardMatchesSnapshot(band) {
    var snap=_snapshot["radio-"+band]; if(!snap) return false;
    var curCountry=_getFieldVal("country-"+band);
    var curCustom=(curCountry==="OTHER")?(_getFieldVal("country-"+band+"-custom")||""):"";
    return String(snap.ch)===String(_getFieldVal("ch-"+band)) &&
           String(snap.ht)===String(_getFieldVal("ht-"+band)) &&
           String(snap.hw)===String(_getFieldVal("hw-"+band)) &&
           String(snap.pwr)===String(_getFieldVal("pwr-"+band)) &&
           String(snap.country)===String(curCountry) &&
           String(snap.countryCustom||"")===String(curCustom);
  }
  function markDirty(band) {
    if(_cardMatchesSnapshot(band)) { markClean(band); return; }
    _dirty["radio-"+band]=true;
    updateUniversalSave();
  }
  function markClean(band) {
    _dirty["radio-"+band]=false;
    updateUniversalSave();
  }

  // ── Universal Save & Apply (all bands) ────────────────────────────────────────
  function anyPendingRadioChanges(){
    for(var k in _dirty) if(_dirty[k]) return true;
    return false;
  }
  function updateUniversalSave(){
    var bar=document.getElementById("universal-save-bar");
    var btn=document.getElementById("usb-apply");
    var status=document.getElementById("usb-status");
    var has=anyPendingRadioChanges();
    if(btn) btn.disabled=!has;
    if(status) status.textContent=has?"Unsaved changes":"No changes";
    if(bar) bar.classList.toggle("has-changes",has);
  }
  function saveAllUniversal() {
    var bandsOrder=["2g","5g","5gb","6g"];
    var tasks=[], reviewChanges=[];
    bandsOrder.forEach(function(band){
      if(!_dirty["radio-"+band]) return;
      var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
      tasks.push({band:band,label:bandLabel});
      var snap=_snapshot["radio-"+band]?JSON.parse(JSON.stringify(_snapshot["radio-"+band])):null;
      var lines=_buildRadioChanges(band,snap);
      lines.forEach(function(l){ reviewChanges.push(bandLabel+": "+l); });
    });
    if(!tasks.length){toast("ok","No changes to save");return;}

    var overlay=document.getElementById('save-confirm-overlay');
    var list=document.getElementById('save-confirm-changes');
    var applyBtn=document.getElementById('save-confirm-apply-btn');
    var msgEl=document.getElementById('save-confirm-msg');
    if(msgEl) msgEl.textContent="Changing radio settings will briefly disconnect all Wi-Fi clients on the affected bands.";
    if(list){ list.innerHTML=""; reviewChanges.forEach(function(c){var d=document.createElement("div");d.className="save-confirm-change";d.textContent=c;list.appendChild(d);}); }
    overlay.classList.add('show');
    applyBtn.onclick=function(){
      overlay.classList.remove('show');
      showSaving("Saving radio settings...","Applying channel/mode settings");
      var allChanges=[], step=0;
      function next(ok,msg){
        if(!ok){hideSaving();toast("err",msg||"Save failed");return;}
        if(step>=tasks.length){hideSaving();toast("ok","Radio settings saved",allChanges);loadConfig();return;}
        var task=tasks[step++];
        _doSaveRadio(task.band,function(r){
          if(r&&r.success){var snap=_snapshot["radio-"+task.band]?JSON.parse(JSON.stringify(_snapshot["radio-"+task.band])):null;var ic=_buildRadioChanges(task.band,snap);ic.forEach(function(l){allChanges.push(task.label+": "+l);});snapshotCard(task.band);markClean(task.band);}
          next(r&&r.success,r&&r.message);
        });
      }
      next(true);
    };
  }

  // ── Change log builder ────────────────────────────────────────────────────────
  function _buildRadioChanges(band, snap) {
    if(!snap) return [];
    var lines=[];
    if(snap.ch!==_getFieldVal("ch-"+band))      lines.push("Channel set to "+_getFieldVal("ch-"+band));
    if(snap.ht!==_getFieldVal("ht-"+band))      lines.push("Width set to "+_getFieldVal("ht-"+band));
    if(snap.hw!==_getFieldVal("hw-"+band))      lines.push("Wi-Fi mode set to "+_getFieldVal("hw-"+band));
    if(snap.pwr!==_getFieldVal("pwr-"+band))    lines.push("TX power set to "+(_getFieldVal("pwr-"+band)||"Auto"));
    if(snap.country!==_getFieldVal("country-"+band)) lines.push("Country set to "+(_getFieldVal("country-"+band)||"unset"));
    return lines;
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  function _doSaveRadio(band, cb) {
    var rawHtmode=document.getElementById("ht-"+band).value;
    var noscan="0", htmode=rawHtmode;
    if(rawHtmode.indexOf("_FORCE")!==-1){htmode=rawHtmode.replace("_FORCE","");noscan="1";}
    var d="save_type=radio"
      +"&band="+encodeURIComponent(band)
      +"&radio_sec="+encodeURIComponent(document.getElementById("h-radio-sec-"+band).value)
      +"&channel="+encodeURIComponent(document.getElementById("ch-"+band).value)
      +"&htmode="+encodeURIComponent(htmode)
      +"&noscan="+encodeURIComponent(noscan)
      +"&txpower="+encodeURIComponent(document.getElementById("pwr-"+band).value)
      +"&country="+encodeURIComponent(getCountryVal("country-"+band,"country-"+band+"-custom"))
      +"&dev_disabled=0";
    ajax("POST",BASE+"/save_wireless",d,cb);
  }
  function saveRadio(band) {
    var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";
    if(!_dirty["radio-"+band]){toast("ok","No changes to save");return;}

    var snapBefore=_snapshot["radio-"+band]?JSON.parse(JSON.stringify(_snapshot["radio-"+band])):null;
    var reviewChanges=_buildRadioChanges(band,snapBefore);

    var overlay = document.getElementById('save-confirm-overlay');
    var list = document.getElementById('save-confirm-changes');
    var applyBtn = document.getElementById('save-confirm-apply-btn');
    var msgEl = document.getElementById('save-confirm-msg');
    if (msgEl) msgEl.textContent = "Changing radio settings will briefly disconnect all Wi-Fi clients on this band.";

    if (list) {
      list.innerHTML = "";
      reviewChanges.forEach(function(c) {
        var d = document.createElement("div"); d.className = "save-confirm-change"; d.textContent = c; list.appendChild(d);
      });
    }

    overlay.classList.add('show');
    applyBtn.onclick = function() {
      overlay.classList.remove('show');
      showSaving("Saving "+bandLabel+" radio...","Applying channel/mode settings");
      _doSaveRadio(band,function(r){
        hideSaving();
        if(r&&r.success){var changes=_buildRadioChanges(band,snapBefore);snapshotCard(band);markClean(band);toast("ok",bandLabel+" radio saved",changes);}
        else{toast("err",(r&&r.message)||"Unknown error");}
      });
    };
  }

  // ── buildBandPanel (radio card only) ──────────────────────────────────────────
  function buildBandPanel(band, wData, countries) {
    var container=document.getElementById("bp-"+band); if(!container) return;
    container.innerHTML="";
    var bandLabel=band==="2g"?"2.4 GHz":band==="6g"?"6 GHz":band==="5gb"?"5 GHz (2)":"5 GHz";

    var is2g=(band==="2g"), is6g=(band==="6g");
    var modeOpts=is6g?
      '<option value="11ax">802.11ax (Wi-Fi 6E)</option><option value="11be">802.11be (Wi-Fi 7)</option>':
      is2g?
      '<option value="legacy">802.11b/g</option><option value="11n">802.11n (Wi-Fi 4)</option><option value="11ax">802.11ax (Wi-Fi 6)</option><option value="11be">802.11be (Wi-Fi 7)</option>':
      '<option value="legacy">802.11a</option><option value="11n">802.11n (Wi-Fi 4)</option><option value="11ac">802.11ac (Wi-Fi 5)</option><option value="11ax">802.11ax (Wi-Fi 6)</option><option value="11be">802.11be (Wi-Fi 7)</option>';
    var radioCard=document.createElement("div");
    radioCard.className="nc-card radio-card";
    radioCard.innerHTML=
      '<div class="nc-card-head">'+
        '<div class="nc-card-head-left">'+
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>'+
          '<h2>'+bandLabel+' – Radio</h2>'+
        '</div>'+
      '</div>'+
      '<div class="nc-card-body" style="padding-bottom:16px">'+
        '<input type="hidden" id="h-radio-sec-'+band+'" value="">'+
        '<div class="fg">'+
          '<div class="nf"><label>Channel</label>'+
            '<select id="ch-'+band+'" onchange="this.dataset.uciChannel=this.value;markDirty(\''+band+'\')">'+
              '<option value="auto">Auto</option></select>'+
            (is2g?'<span class="hint">Ch 1, 6, 11 minimize overlap</span>':'')+
            ((band==="5g"||band==="5gb")?'<span class="hint">Some channels may be unavailable in the selected regulatory country</span>':'')+
          '</div>'+
          '<div class="nf"><label>Width</label><select id="ht-'+band+'" onchange="markDirty(\''+band+'\')"></select></div>'+
          '<div class="nf"><label>TX Power</label><select id="pwr-'+band+'" onchange="markDirty(\''+band+'\')"><option value="">Auto (Max)</option></select></div>'+
          '<div class="nf"><label>Mode</label><select id="hw-'+band+'" onchange="syncWidth(\''+band+'\',this.value);markDirty(\''+band+'\')">'+modeOpts+'</select></div>'+
          '<div class="nf"><label>Country</label>'+
            '<select id="country-'+band+'" onchange="toggleCustomCountry(\'country-'+band+'-custom\',this.value);if(this.value!==\'OTHER\'){var c=document.getElementById(\'country-'+band+'-custom\');if(c)c.value=\'\';}rebuildChannels(\''+band+'\');markDirty(\''+band+'\')"><option value="">- Unset -</option></select>'+
            '<input type="text" id="country-'+band+'-custom" maxlength="2" placeholder="XX" style="display:none;width:60px;text-transform:uppercase" oninput="markDirty(\''+band+'\')">'+
          '</div>'+
         '</div>'+
       '</div>';
     container.appendChild(radioCard);

    // Populate radio fields
    setVal("h-radio-sec-"+band,wData.radio_sec);
    syncWidth(band,wData.wifi_gen||"11n",wData.htmode);
    var ht=wData.htmode;
    if(is2g&&wData.noscan==="1"&&ht&&ht.indexOf("40")!==-1) ht=ht+"_FORCE";
    selVal("ht-"+band,ht);
    selVal("hw-"+band,wData.wifi_gen||(is6g?"11ax":is2g?"11n":"11ac"));
    capModeSelect("hw-"+band,wData.hw_max);
    updateBandLabel(band,wData.hw_max||wData.wifi_gen);
    rebuildChannels(band,wData.channel||"auto",wData.txpower||"");
    if(countries) {
      var cSel=document.getElementById("country-"+band);
      var known=countries.map(function(c){return c[0];});
      var cVal=(wData.country||"").toUpperCase();
      buildCountryOptions(cSel,countries,(known.indexOf(cVal)!==-1?cVal:""));
      if(cVal&&known.indexOf(cVal)===-1){
        selVal("country-"+band,"OTHER"); setVal("country-"+band+"-custom",cVal);
        var box=document.getElementById("country-"+band+"-custom"); if(box) box.style.display="inline-block";
      }
    }
    upgradeSelects(container);
    snapshotCard(band);
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
      list.id=listId; list.style.position="fixed"; list.style.zIndex="99";
      var isCountry=sel.id&&sel.id.indexOf("country")!==-1;
      if(isCountry) list.dataset.country="1";
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
        if(isCountry){
          var sb=document.createElement("input"); sb.type="text"; sb.className="csel-search"; sb.placeholder="Search country...";
          sb.addEventListener("click",function(e){e.stopPropagation();});
          sb.addEventListener("input",function(){_renderOpts(this.value);});
          sb.addEventListener("keydown",function(e){if(e.key==="Enter"){var f=list.querySelector(".csel-opt");if(f)f.click();}if(e.key==="Escape")cselCloseAll();});
          list.appendChild(sb);
        }
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
    _radioCaps={}; _radioCapsReady=false; _radioCapWait={};
    ajax("GET",BASE+"/get_radio_capabilities",null,function(result){
      _radioCaps=(result&&result.radios)||{};
      _radioCapsReady=true;
      Object.keys(_radioCapWait).forEach(function(radio){
        var pending=_radioCapWait[radio];
        rebuildChannels(pending.band,pending.currentCh,pending.wantedPwr);
      });
      _radioCapWait={};
    });
    ajax("GET",BASE+"/get_radio_config",null,function(cfg){
      if(!cfg||cfg.error){toast("err",(cfg&&cfg.error)||"Failed to load config");return;}

      var bandMap=[{cfgKey:"w2",uiKey:"2g"},{cfgKey:"w5",uiKey:"5g"},{cfgKey:"w5b",uiKey:"5gb"},{cfgKey:"w6",uiKey:"6g"}];
      var firstBand=null;
      bandMap.forEach(function(bm){
        var wData=cfg[bm.cfgKey]; if(!wData) { if(bm.uiKey!=="2g"&&bm.uiKey!=="5g"){var t=document.getElementById("tab-"+bm.uiKey);if(t)t.style.display="none";} return; }
        if(bm.uiKey!=="2g"&&bm.uiKey!=="5g"){var t2=document.getElementById("tab-"+bm.uiKey);if(t2)t2.style.display="";}
        _bandCfg[bm.uiKey]=wData;
        buildBandPanel(bm.uiKey,wData,cfg.countries);
        if(!firstBand) firstBand=bm.uiKey;
      });
      if(firstBand) switchBand(firstBand,document.getElementById("tab-"+firstBand));
    });
  }

  loadConfig();
