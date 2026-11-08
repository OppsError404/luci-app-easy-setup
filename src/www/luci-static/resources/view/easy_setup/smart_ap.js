    var BASE = window.location.pathname.replace(/\/smart_ap\/?$/, "");
    var EYE_ON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYE_OFF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    var CHEVRON_DOWN = '<svg class="extra-opt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    function toggleExtraOptions(sfx) {
      var detail = document.getElementById("extra-opt-" + sfx);
      var chevron = document.getElementById("extra-opt-chevron-" + sfx);
      if (!detail) return;

      if (detail.classList.contains("open")) {
        detail.classList.remove("open");
        if (chevron) chevron.style.transform = "";
      } else {
        detail.classList.add("open");
        if (chevron) chevron.style.transform = "rotate(180deg)";
      }
    }

    var _meshDirty = {};
    var _meshPendingDelete = {};
    var _meshSnapshot = {};
    var _smartCandidates = [];
    var _wpa3Supported = false;

    // Build the Security <option> list for Smart AP cards (Open/WPA2/WPA-WPA2/WPA3).
    // WPA3 (sae) is only offered when the running wpad/hostapd supports SAE; an
    // existing sae config is still rendered (selected) so a saved WPA3 SSID
    // stays representable if support is later removed.
    function _encOpts(selected) {
      var s = selected || "none";
      var o = '<option value="none" ' + (s === 'none' ? 'selected' : '') + '>Open</option>' +
              '<option value="psk2" ' + (s === 'psk2' ? 'selected' : '') + '>WPA2</option>' +
              '<option value="psk-mixed" ' + (s === 'psk-mixed' ? 'selected' : '') + '>WPA/WPA2</option>';
      if (_wpa3Supported || s === 'sae') {
        o += '<option value="sae" ' + (s === 'sae' ? 'selected' : '') + '>WPA3</option>';
      }
      return o;
    }

    // ── Theme ─────────────────────────────────────────────────────────────────────
    (function initTheme() {
      var wrap = document.querySelector(".nc-wrap");
      function apply(isLight) { if (wrap) wrap.classList.toggle("theme-light", isLight); }
      var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq ? !mq.matches : false);
      if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { apply(!e.matches); });
    })();

    // ── Custom select engine ──────────────────────────────────────────────────────
    var _openCsel = null;

    document.addEventListener("click", function (e) {
      if (!_openCsel) return;
      var list = document.getElementById(_openCsel.listId);
      if (list && list.contains(e.target)) return;
      if (_openCsel.trigger.contains(e.target)) return;
      cselCloseAll();
    });
    document.addEventListener("touchend", function (e) {
      if (!_openCsel) return;
      var list = document.getElementById(_openCsel.listId);
      if (list && list.contains(e.target)) return;
      if (_openCsel.trigger.contains(e.target)) return;
      cselCloseAll();
    }, true);

    function cselCloseAll() {
      if (!_openCsel) return;
      _openCsel.trigger.classList.remove("open");
      var list = document.getElementById(_openCsel.listId);
      if (list) {
        list.classList.remove("open", "flip-up");
      }
      _openCsel = null;
    }

    function _cselPosition(trigger, list) {
      var rect = trigger.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var navbarEl = document.querySelector(".luci-navbar, #navbar, nav.navbar, header.navbar, .cbi-map > .cbi-section:first-child");
      var NAVBAR_BOTTOM = navbarEl ? navbarEl.getBoundingClientRect().bottom : 52;
      var TOP_CLEARANCE = Math.max(NAVBAR_BOTTOM + 4, 56);

      var listMinW = list.dataset.minw ? parseInt(list.dataset.minw) : 160;
      var listW = Math.max(rect.width, listMinW);
      var left = rect.left;
      if (left + listW > vw - 8) left = vw - listW - 8;
      if (left < 8) left = 8;
      list.style.width = listW + "px";
      list.style.left = left + "px";
      list.style.top = "";
      list.style.bottom = "";
      list.classList.remove("flip-up");

      var spaceBelow = vh - rect.bottom - 8;
      var spaceAbove = rect.top - TOP_CLEARANCE;
      var maxH = 220;

      if (spaceBelow >= 80 || spaceBelow >= spaceAbove) {
        list.style.top = (rect.bottom + 4) + "px";
        list.style.bottom = "";
        list.style.maxHeight = Math.min(maxH, spaceBelow) + "px";
      } else {
        list.classList.add("flip-up");
        var allowedUp = Math.min(maxH, spaceAbove);
        var listBottom = vh - rect.top + 4;
        var listTop = rect.top - 4 - allowedUp;
        if (listTop < TOP_CLEARANCE) {
          list.classList.remove("flip-up");
          list.style.top = (rect.bottom + 4) + "px";
          list.style.bottom = "";
          list.style.maxHeight = Math.min(maxH, spaceBelow) + "px";
        } else {
          list.style.top = "";
          list.style.bottom = listBottom + "px";
          list.style.maxHeight = allowedUp + "px";
        }
      }
    }

    window.addEventListener("scroll", function (e) {
      if (!_openCsel) return;
      var list = document.getElementById(_openCsel.listId);
      if (list && list.contains(e.target)) return;
      cselCloseAll();
    }, true);
    window.addEventListener("resize", function () {
      if (!_openCsel) return;
      var list = document.getElementById(_openCsel.listId);
      if (!list) return;
      _cselPosition(_openCsel.trigger, list);
    });

    var CHEVRON = '<svg class="csel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    function upgradeSelects(root) {
      var selects = (root || document).querySelectorAll(".nf select:not([data-csu])");
      selects.forEach(function (sel) {
        sel.setAttribute("data-csu", "1");
        var nf = sel.closest('.nf');
        if (nf) nf.classList.add('nf-has-select');
        sel.style.display = "none";
        var wrap = document.createElement("div");
        wrap.className = "csel-wrap";
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        var trigger = document.createElement("div");
        trigger.className = "csel";
        trigger.innerHTML = '<span class="csel-val"></span>' + CHEVRON;
        wrap.appendChild(trigger);
        var listId = "csel-" + Math.random().toString(36).slice(2, 9);
        var list = document.createElement("div");
        list.className = "csel-list";
        if (sel.closest(".ssid-card")) list.classList.add("csel-blue");
        list.id = listId;
        list.style.position = "fixed";
        list.style.zIndex = "99";
        document.body.appendChild(list);

        function _renderOpts() {
          list.innerHTML = "";
          Array.from(sel.options).forEach(function (opt) {
            var d = document.createElement("div");
            d.className = "csel-opt"; d.dataset.val = opt.value; d.textContent = opt.textContent;
            if (opt.selected) d.classList.add("selected");
            d.addEventListener("click", function (e) {
              e.stopPropagation();
              sel.value = opt.value;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              syncDisplay(); cselCloseAll();
            });
            list.appendChild(d);
          });
        }

        function syncDisplay() {
          var opt = sel.options[sel.selectedIndex];
          var sp = trigger.querySelector(".csel-val");
          if (sp) sp.textContent = opt ? opt.textContent : "";
          list.querySelectorAll(".csel-opt").forEach(function (o) {
            o.classList.toggle("selected", o.dataset.val === sel.value);
          });
        }

        _renderOpts(); syncDisplay();
        sel._cselSync = syncDisplay;

        trigger.addEventListener("click", function (e) {
          e.stopPropagation();
          if (_openCsel && _openCsel.trigger !== trigger) cselCloseAll();
          if (list.classList.contains("open")) { cselCloseAll(); return; }
          var wrap2 = document.querySelector(".nc-wrap");
          var isLight = wrap2 && wrap2.classList.contains("theme-light");
          list.classList.toggle("theme-light", !!isLight);
          _cselPosition(trigger, list);
          trigger.classList.add("open");
          list.classList.add("open");
          _openCsel = { trigger: trigger, listId: listId };
          var sel2 = list.querySelector(".csel-opt.selected");
          if (sel2) setTimeout(function () { sel2.scrollIntoView({ block: "nearest" }); }, 0);
        });
      });
    }

    function toggleEye(btn, id) {
      var el = document.getElementById(id);
      var showing = el.type === "password";
      el.type = showing ? "text" : "password";
      btn.innerHTML = showing ? EYE_OFF : EYE_ON;
      btn.setAttribute("aria-label", showing ? "Hide password" : "Show password");
    }

    function snapshotMeshCard(sfx) {
      var ssid = document.getElementById("ssid-" + sfx).value;
      var enc = document.getElementById("enc-" + sfx).value;
      var key = document.getElementById("key-" + sfx).value;
      var hid = document.getElementById("hid-" + sfx).value;
      var en = document.getElementById("en-" + sfx).checked;
      var roam = document.getElementById("roam-" + sfx).checked;
      var iso = document.getElementById("iso-" + sfx).checked;
      var wnm = document.getElementById("wnm-" + sfx).checked;

      _meshSnapshot[sfx] = {
        ssid: ssid, enc: enc, key: key, hidden: hid, enabled: en, roam: roam, isolate: iso, wnm: wnm
      };
    }

    function meshMarkDirty(sfx) {
      var snap = _meshSnapshot[sfx];
      var card = document.getElementById("ssid-" + sfx).closest(".nc-card");
      var isNew = card.hasAttribute("data-is-new");

      var ssid = document.getElementById("ssid-" + sfx).value;
      var enc = document.getElementById("enc-" + sfx).value;
      var key = document.getElementById("key-" + sfx).value;
      var hid = document.getElementById("hid-" + sfx).value;
      var en = document.getElementById("en-" + sfx).checked;
      var roam = document.getElementById("roam-" + sfx).checked;
      var iso = document.getElementById("iso-" + sfx).checked;
      var wnm = document.getElementById("wnm-" + sfx).checked;

      // Update warning visibility
      var warn = document.getElementById("roam-warn-" + sfx);
      if (warn) warn.style.display = roam ? "none" : "flex";

      if (!snap) {
        if (isNew) { var saveBtn2 = document.getElementById("savebtn-" + sfx); if (saveBtn2) saveBtn2.disabled = false; }
        return;
      }

      var isDirty = (ssid !== snap.ssid || enc !== snap.enc || key !== snap.key ||
        hid !== snap.hidden || en !== snap.enabled ||
        roam !== snap.roam || iso !== snap.isolate || wnm !== snap.wnm);
      _meshDirty[sfx] = isDirty;

      var saveBtn = document.getElementById("savebtn-" + sfx);
      if (saveBtn) saveBtn.disabled = !isDirty && !isNew;

      updateUniversalSave();
    }

    function updateUniversalSave() {
      var anyDirty = false;
      for (var k in _meshDirty) if (_meshDirty[k]) { anyDirty = true; break; }
      for (var k in _meshPendingDelete) if (_meshPendingDelete[k]) { anyDirty = true; break; }

      var bar = document.getElementById("universal-save-bar");
      var btn = document.getElementById("usb-apply");
      var status = document.getElementById("usb-status");
      if (btn) btn.disabled = !anyDirty;
      if (status) status.textContent = anyDirty ? "Unsaved changes" : "No changes";
      if (bar) bar.classList.toggle("has-changes", anyDirty);
    }

    function meshMarkClean(sfx) {
      _meshDirty[sfx] = false;
      updateUniversalSave();
    }

    function markDeleteMesh(sfx) {
      _meshPendingDelete[sfx] = true;
      var card = document.getElementById("ssid-" + sfx).closest(".nc-card");
      var head = card.querySelector(".nc-card-head");
      if (head) head.classList.add("head-del-ssid");

      var delBtn = document.getElementById("delbtn-" + sfx);
      if (delBtn) {
        delBtn.className = "btn-undo-delete";
        delBtn.textContent = "Undo Remove";
        delBtn.setAttribute("onclick", "undoDeleteMesh('" + sfx + "')");
      }

      card.classList.add("pending-delete");
      updateUniversalSave();
    }

    function undoDeleteMesh(sfx) {
      _meshPendingDelete[sfx] = false;
      var card = document.getElementById("ssid-" + sfx).closest(".nc-card");
      var head = card.querySelector(".nc-card-head");
      if (head) head.classList.remove("head-del-ssid");

      var delBtn = document.getElementById("delbtn-" + sfx);
      if (delBtn) {
        delBtn.className = "btn-delete-iface";
        delBtn.textContent = "Remove";
        delBtn.setAttribute("onclick", "markDeleteMesh('" + sfx + "')");
      }

      card.classList.remove("pending-delete");
      updateUniversalSave();
    }

    
    function ajax(method, url, body, cb) {
  return EasySetup.ajax(method, url, body, cb);
}

    function toast(type, msg) {
      var overlay = document.getElementById("toast-overlay");
      var icon = document.getElementById("toast-overlay-icon");
      var text = document.getElementById("toast-overlay-text");
      if (!overlay || !icon || !text) return;
      icon.className = "toast-overlay-icon " + type;
      icon.innerHTML = type === "ok" ? "✓" : "✕";
      text.textContent = msg;
      overlay.classList.add("show");
      setTimeout(function () { overlay.classList.remove("show"); }, 3000);
    }

    function loadConfig() {
      console.log("Loading Smart AP config...");
      ajax("GET", BASE + "/get_smart_ap_config", null, function (r) {
        if (!r) {
          console.error("Config load failed: no response");
          toast("err", "Failed to load config: no response");
          return;
        }
        if (typeof r === 'string') {
          try {
            r = JSON.parse(r);
          } catch (e) {
            console.error("Config load failed: Parse error:", r);
            toast("err", "Config load failed: Parse error");
            return;
          }
        }
        if (!r.success) {
          console.error("Config load failed:", r.message);
          toast("err", "Failed to load config: " + (r.message || "Unknown error"));
          return;
        }
        console.log("Config loaded:", r);
        _wpa3Supported = !!r.wpa3_supported;
        var warnEl = document.getElementById("wpad-warning");
        if (warnEl) warnEl.style.display = r.wpad_mini ? "flex" : "none";
        renderSsids(r.ssids, r.candidates);
        upgradeSelects();
      });
    }

    function renderSsids(ssids, candidates) {
      var container = document.getElementById("smart-ap-container");
      container.innerHTML = "";
      _meshDirty = {};
      _meshPendingDelete = {};
      _meshSnapshot = {};
      _smartCandidates = candidates || [];
      updateUniversalSave();

      if (ssids.length === 0 && _smartCandidates.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No Mesh APs configured</div>';
        return;
      }

      ssids.forEach(function (s, idx) {
        var card = createSsidCard(s, idx);
        card.setAttribute("data-old-ssid", s.ssid);
        container.appendChild(card);
        snapshotMeshCard(idx);
      });

      if (_smartCandidates.length > 0) {
        var candHeader = document.createElement("div");
        candHeader.style.cssText = "font-size:1.1rem;font-weight:700;margin:24px 0 12px;color:var(--text-strong)";
        candHeader.textContent = "Potential Smart APs";
        container.appendChild(candHeader);
        
        _smartCandidates.forEach(function (c, idx) {
          var card = createCandidateCard(c, idx);
          container.appendChild(card);
        });
      }
    }

    function createCandidateCard(c, idx) {
      var card = document.createElement("div");
      card.className = "nc-card ssid-card candidate-card";
      var bands = c.interfaces.map(function(i){
        return i.band === "2g" ? "2.4GHz" : i.band === "5g" ? "5GHz" : i.band === "5gb" ? "5GHz-2" : "6GHz";
      }).join(", ");

      var html = 
        '<div class="nc-card-head">' +
        '<div class="nc-card-head-left"><h2>SSID: ' + c.ssid + '</h2><span class="smart-ap-badge">Smart AP</span></div>' +
        '<div class="nc-card-head-right"><span class="badge" style="background:rgba(78,168,255,0.15);color:var(--accent);padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700">Multi-band Found</span></div>' +
        '</div>' +
        '<div class="nc-card-body">' +
        '<div style="font-size:0.8rem;color:var(--text-mid);margin-bottom:12px">Found on radios: <b>' + bands + '</b></div>';

      if (c.mismatch) {
        html += '<div class="card-error-badge" style="background:rgba(240,180,50,0.1);border-color:rgba(240,180,50,0.3);color:#f0b432;margin-bottom:12px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          'Configuration mismatch detected across bands. These access points are found on multiple frequencies but need matching settings to function as a unified Smart AP.' +
          '</div>';
      } else {
        html += '<div class="card-error-badge" style="background:rgba(67,232,149,0.1);border-color:rgba(67,232,149,0.3);color:#43e895;margin-bottom:12px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><polyline points="20 6 9 17 4 12"/></svg>' +
          'This SSID is ready to be converted into a Smart AP. Settings match across all detected bands.' +
          '</div>';
      }

      html += '<div class="nc-actions">' +
        '<button class="nc-btn btn-wl" onclick="saveCandidateByIdx(' + idx + ')" style="margin-left:auto">' + (c.mismatch ? 'Configure & Merge' : 'Enable Smart AP') + '</button>' +
        '</div>' +
        '</div>';

      card.innerHTML = html;
      return card;
    }

    function saveCandidateByIdx(idx) {
      var c = _smartCandidates[idx];
      if (!c) return;
      var first = c.interfaces[0];
      var body = "ssid=" + encodeURIComponent(c.ssid) +
        "&old_ssid=" + encodeURIComponent(c.ssid) +
        "&enc=" + encodeURIComponent(first.enc) +
        "&key=" + encodeURIComponent(c.key) +
        "&hidden=" + encodeURIComponent(first.hidden) +
        "&disabled=" + encodeURIComponent(first.disabled) +
        "&roam=" + encodeURIComponent((first.bss_transition === "1" || first.ieee80211k === "1") ? "1" : "0") +
        "&isolate=" + encodeURIComponent(first.isolate) +
        "&wnm=" + encodeURIComponent(first.wnm_sleep_mode) +
        "&is_candidate=1";

      showSaving("Converting to Smart AP...", "Matching settings across all radios");
      ajax("POST", BASE + "/save_smart_ap", body, function (r) {
        hideSaving();
        if (r && r.success) {
          toast("ok", "Smart AP enabled successfully");
          loadConfig();
        } else {
          toast("err", (r && r.message) || "Failed to enable Smart AP");
        }
      });
    }

    function showSaving(text, sub) {
      document.getElementById("save-overlay-text").textContent = text || "Saving...";
      document.getElementById("save-overlay").classList.add("show");
    }

    function hideSaving() {
      document.getElementById("save-overlay").classList.remove("show");
    }

    function _setFieldError(el, msg) {
      if (!el) return;
      el.classList.add("field-error");
      var existing = el.parentNode.querySelector(".field-error-msg");
      if (existing) existing.remove();
      var e = document.createElement("div");
      e.className = "field-error-msg";
      e.textContent = msg;
      el.insertAdjacentElement('afterend', e);
      el.oninput = function () {
        this.classList.remove("field-error");
        var m = this.parentNode.querySelector(".field-error-msg");
        if (m) m.remove();
      };
    }

    function enableRoam(sfx) {
      var el = document.getElementById("roam-" + sfx);
      if (el) {
        el.checked = true;
        meshMarkDirty(sfx);
      }
    }

    function createSsidCard(s, idx) {
      var isNew = !s;
      var card = document.createElement("div");
      card.className = "nc-card ssid-card";
      var sfx = idx;
      card.dataset.sfx = sfx;
      var ssidValue = s ? s.ssid : "";
      var encValue = s ? s.encryption : "none";
      var roamOn = s ? (s.bss_transition === "1" || s.ieee80211k === "1") : true;

      card.innerHTML =
        '<div class="nc-card-head' + (isNew ? ' head-new-ssid' : '') + '">' +
        '<div class="nc-card-head-left">' +
        '<h2>' + (isNew ? 'New SSID' : 'SSID: ' + ssidValue) + '</h2>' +
        '<span class="smart-ap-badge">Smart AP</span>' +
        '</div>' +
        '<div class="nc-card-head-right">' +
        '<div class="tog-wrap">' +
        '<span class="tog-lbl">Enabled</span>' +
        '<label class="toggle">' +
        '<input type="checkbox" id="en-' + sfx + '" ' + (isNew || (s && s.disabled !== "1") ? "checked" : "") + ' onchange="meshMarkDirty(\'' + sfx + '\')">' +
        '<div class="tog-track"></div><div class="tog-thumb"></div>' +
        '</label>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="nc-card-body">' +
        (s && !s.network ? '<div class="card-error-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> No Interface Assigned: This SSID will not be functional until it is assigned to a network interface.</div>' : '') +
        '<div id="roam-warn-' + sfx + '" class="card-error-badge" style="background:rgba(240,180,50,0.1);border-color:rgba(240,180,50,0.3);color:#f0b432;margin-bottom:12px;display:' + (roamOn ? 'none' : 'flex') + ';align-items:center;justify-content:space-between">' +
        '<div style="display:flex;align-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<span>Roaming Assist is disabled. This is recommended for unified Smart APs to ensure smooth device handoff.</span></div>' +
        '<button class="nc-btn" onclick="enableRoam(\'' + sfx + '\')" style="height:24px;min-width:auto;padding:0 8px;font-size:0.65rem;background:rgba(240,180,50,0.12);color:#f0b432;border:1px solid rgba(240,180,50,0.3);margin-left:8px">Enable Now</button>' +
        '</div>' +
        '<div class="fg">' +
        '<div class="nf"><label>SSID (Network Name) <span style="color:#e05a52">*</span></label><input type="text" id="ssid-' + sfx + '" value="' + ssidValue + '" placeholder="WiFi Network Name" oninput="meshMarkDirty(\'' + sfx + '\')"></div>' +
        '<div class="nf"><label>Broadcast SSID</label>' +
        '<select id="hid-' + sfx + '" onchange="meshMarkDirty(\'' + sfx + '\')">' +
        '<option value="0" ' + (s && s.hidden != '1' ? 'selected' : '') + '>Yes (Visible)</option>' +
        '<option value="1" ' + (s && s.hidden == '1' ? 'selected' : '') + '>No (Hidden)</option>' +
        '</select>' +
        '</div>' +
        '<div class="nf"><label>Security</label>' +
        '<select id="enc-' + sfx + '" onchange="var kw=document.getElementById(\'kw-' + sfx + '\'); if(kw) kw.style.display=(this.value==\'none\'?\'none\':\'\'); meshMarkDirty(\'' + sfx + '\')">' +
        _encOpts(encValue) +
        '</select>' +
        '</div>' +
        '<div class="nf" id="kw-' + sfx + '" style="' + (encValue == 'none' ? 'display:none' : '') + '"><label>Password <span style="color:#e05a52">*</span></label>' +
        '<div class="pw-wrap">' +
        '<input type="password" id="key-' + sfx + '" value="' + (s ? (s.key || "") : "") + '" placeholder="Min 8 characters" oninput="meshMarkDirty(\'' + sfx + '\')">' +
        '<button class="pw-eye" type="button" onclick="toggleEye(this,\'key-' + sfx + '\')">' + EYE_ON + '</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="radio-card-divider" style="margin-top:10px">' +
        '<div class="extra-opt-toggle" onclick="toggleExtraOptions(\'' + sfx + '\')">' +
        'Extra Options <span id="extra-opt-chevron-' + sfx + '" class="extra-opt-chevron">' + CHEVRON_DOWN + '</span>' +
        '</div>' +
        '</div>' +
        '<div id="extra-opt-' + sfx + '" class="extra-opt-content"><div class="extra-opt-inner">' +
        '<div class="guest-opt-row">' +
        '<div class="guest-opt-left">' +
        '<div class="guest-opt-title">Client Isolation</div>' +
        '<div class="guest-opt-desc">Restricts connected clients from communicating with each other. Enhances security by isolating peer-to-peer traffic on the same wireless network.</div>' +
        '<div class="guest-opt-note">Note: Disables local network discovery and peer-to-peer resource sharing (e.g., AirDrop, Chromecast, Printer sharing).</div>' +
        '</div>' +
        '<label class="toggle" style="flex-shrink:0">' +
        '<input type="checkbox" id="iso-' + sfx + '" ' + (s && s.isolate == "1" ? "checked" : "") + ' onchange="meshMarkDirty(\'' + sfx + '\')">' +
        '<div class="tog-track"></div><div class="tog-thumb"></div>' +
        '</label>' +
        '</div>' +
        '<div class="guest-opt-row">' +
        '<div class="guest-opt-left">' +
        '<div class="guest-opt-title">Roaming Assist</div>' +
        '<div class="guest-opt-desc">Optimizes client steering using 802.11k/v neighbor reports and BSS transitions. Facilitates faster, intelligent handoffs between APs.</div>' +
        '</div>' +
        '<label class="toggle" style="flex-shrink:0">' +
        '<input type="checkbox" id="roam-' + sfx + '" ' + (roamOn ? "checked" : "") + ' onchange="meshMarkDirty(\'' + sfx + '\')">' +
        '<div class="tog-track"></div><div class="tog-thumb"></div>' +
        '</label>' +
        '</div>' +
        '<div class="guest-opt-row">' +
        '<div class="guest-opt-left">' +
        '<div class="guest-opt-title">Power Saving</div>' +
        '<div class="guest-opt-desc">Implements WNM Sleep Mode to reduce signaling overhead. Extends battery life for connected mobile and IoT devices.</div>' +
        '<div class="guest-opt-caution">Caution: May cause connectivity issues or increased latency on some legacy hardware.</div>' +
        '</div>' +
        '<label class="toggle" style="flex-shrink:0">' +
        '<input type="checkbox" id="wnm-' + sfx + '" ' + (s && s.wnm_sleep_mode == "1" ? "checked" : "") + ' onchange="meshMarkDirty(\'' + sfx + '\')">' +
        '<div class="tog-track"></div><div class="tog-thumb"></div>' +
        '</label>' +
        '</div>' +
        '</div></div>' +
        '<div class="pending-delete-notice">This SSID will be removed on the next save.</div>' +
        '<div class="nc-actions">' +
        (isNew ? '<button class="nc-btn btn-sec" onclick="cancelNewSsid(this)">Cancel</button>' +
          '<button class="nc-btn btn-add" id="savebtn-' + sfx + '" onclick="saveOneMesh(\'' + sfx + '\')">Add</button>'
          : '<button class="btn-delete-iface" id="delbtn-' + sfx + '" onclick="markDeleteMesh(\'' + sfx + '\')" style="margin-right:auto">Remove</button>') +
        '</div>';
      return card;
    }

    function cancelNewSsid(btn) {
      var card = btn.closest(".nc-card");
      if (card) card.remove();
      updateUniversalSave();
    }

    function addNewSsidCard() {
      var container = document.getElementById("smart-ap-container");
      if (container.querySelector(".nc-card-body") && container.innerHTML.indexOf("New SSID") !== -1) return;
      if (container.innerHTML.indexOf("No Mesh SSIDs") !== -1) container.innerHTML = "";
      var idx = "new-" + Math.random().toString(36).slice(2, 7);
      var card = createSsidCard(null, idx);
      card.setAttribute("data-is-new", "1");
      container.appendChild(card);
      upgradeSelects(card);
    }

    function saveOneMesh(sfx) {
      var card = document.getElementById("ssid-" + sfx).closest(".nc-card");
      var oldSsid = card.getAttribute("data-old-ssid") || "";
      var isNew = card.hasAttribute("data-is-new");

      if (_meshPendingDelete[sfx]) {
        if (!confirm("Are you sure you want to remove SSID '" + oldSsid + "'?")) return;
        document.getElementById("save-overlay").classList.add("show");
        ajax("POST", BASE + "/delete_smart_ap", "ssid=" + encodeURIComponent(oldSsid), function (r) {
          document.getElementById("save-overlay").classList.remove("show");
          if (r.success) { toast("ok", "SSID deleted"); loadConfig(); }
          else { toast("err", r.message || "Failed to delete"); }
        });
        return;
      }

      var ssidEl = document.getElementById("ssid-" + sfx);
      var keyEl = document.getElementById("key-" + sfx);
      var ssid = ssidEl.value.trim();
      var enc = document.getElementById("enc-" + sfx).value;
      var key = keyEl.value;
      var hid = document.getElementById("hid-" + sfx).value;
      var en = document.getElementById("en-" + sfx).checked;
      var roam = document.getElementById("roam-" + sfx).checked;
      var iso = document.getElementById("iso-" + sfx).checked;
      var wnm = document.getElementById("wnm-" + sfx).checked;

      if (!ssid) { _setFieldError(ssidEl, "SSID is required"); ssidEl.focus(); return; }
      if (enc !== "none" && key.length < 8) {
        _setFieldError(keyEl, "Password must be at least 8 characters");
        keyEl.focus();
        return;
      }

      function performSave() {
        document.getElementById("save-overlay").classList.add("show");
        var body = "ssid=" + encodeURIComponent(ssid) +
          "&old_ssid=" + encodeURIComponent(oldSsid) +
          "&enc=" + encodeURIComponent(enc) +
          "&key=" + encodeURIComponent(key) +
          "&hidden=" + encodeURIComponent(hid) +
          "&disabled=" + (en ? "0" : "1") +
          "&roam=" + (roam ? "1" : "0") +
          "&isolate=" + (iso ? "1" : "0") +
          "&wnm=" + (wnm ? "1" : "0");

        ajax("POST", BASE + "/save_smart_ap", body, function (r) {
          document.getElementById("save-overlay").classList.remove("show");
          if (r.success) {
            toast("ok", "Settings saved successfully");
            loadConfig();
          } else {
            toast("err", r.message || "Failed to save");
          }
        });
      }

      if (isNew) {
        performSave();
      } else {
        var overlay = document.getElementById('ssid-confirm-overlay');
        var yesBtn = document.getElementById('ssid-confirm-yes');
        var msgEl = document.getElementById('ssid-confirm-msg');
        if (msgEl) msgEl.textContent = "Clients on SSID: " + ssid + " will briefly disconnect.";
        overlay.classList.add('show');
        yesBtn.onclick = function () {
          overlay.classList.remove('show');
          performSave();
        };
      }
    }

    function saveAllUniversal() {
      var container = document.getElementById("smart-ap-container");
      var cards = container.querySelectorAll(".nc-card.ssid-card");
      var tasks = [];

       cards.forEach(function (card) {
         var sfx = card.dataset.sfx || (card.querySelector("input[id^='ssid-']") || {}).id;
         if (sfx && sfx.indexOf("ssid-") === 0) sfx = sfx.replace(/^ssid-/, "");
         if (_meshPendingDelete[sfx]) {
          var oldSsid = card.getAttribute("data-old-ssid");
          if (oldSsid) tasks.push({ type: "delete", ssid: oldSsid });
          return;
        }
        if (card.hasAttribute("data-is-new")) return;
        if (!_meshDirty[sfx]) return;

        var ssidEl = document.getElementById("ssid-" + sfx);
        var keyEl = document.getElementById("key-" + sfx);
        var ssid = ssidEl.value.trim();
        var enc = document.getElementById("enc-" + sfx).value;
        var key = keyEl.value;
        var hid = document.getElementById("hid-" + sfx).value;
        var en = document.getElementById("en-" + sfx).checked;
        var roam = document.getElementById("roam-" + sfx).checked;
        var iso = document.getElementById("iso-" + sfx).checked;
        var wnm = document.getElementById("wnm-" + sfx).checked;

        if (!ssid) { _setFieldError(ssidEl, "SSID is required"); ssidEl.focus(); return; }
        if (enc !== "none" && key.length < 8) {
          _setFieldError(keyEl, "Password must be at least 8 characters");
          keyEl.focus();
          return;
        }

        tasks.push({
          type: "save",
          ssid: ssid,
          old_ssid: card.getAttribute("data-old-ssid") || "",
          enc: enc,
          key: key,
          hidden: hid,
          disabled: en ? "0" : "1",
          roam: roam ? "1" : "0",
          isolate: iso ? "1" : "0",
          wnm: wnm ? "1" : "0"
        });
      });

      if (tasks.length === 0) return;

      var overlay = document.getElementById('ssid-confirm-overlay');
      var yesBtn = document.getElementById('ssid-confirm-yes');
      var msgEl = document.getElementById('ssid-confirm-msg');
      if (msgEl) {
        var names = tasks.filter(t => t.type === "save").map(t => t.ssid);
        if (names.length > 0) {
          msgEl.textContent = "Clients on SSID: " + names.join(" and ") + " will briefly disconnect.";
        } else {
          msgEl.textContent = "Applying Wi-Fi changes will briefly disconnect connected clients.";
        }
      }
      overlay.classList.add('show');

      yesBtn.onclick = function () {
        overlay.classList.remove('show');
        document.getElementById("save-overlay").classList.add("show");

        var errorMsg = "";

        function nextTask(i) {
          if (i >= tasks.length) {
            document.getElementById("save-overlay").classList.remove("show");
            if (errorMsg) toast("err", "Some tasks failed: " + errorMsg);
            else toast("ok", "All changes applied successfully");
            loadConfig();
            return;
          }

          var t = tasks[i];
          if (t.type === "delete") {
            ajax("POST", BASE + "/delete_smart_ap", "ssid=" + encodeURIComponent(t.ssid), function (r) {
              if (r.pending) {
                document.getElementById("save-overlay").classList.remove("show");
                toast("err", r.message || "Changes are still awaiting confirmation.");
                return;
              }
              if (!r.success) errorMsg = r.message || "Delete failed";
              nextTask(i + 1);
            });
          } else {
            var body = "ssid=" + encodeURIComponent(t.ssid) +
              "&old_ssid=" + encodeURIComponent(t.old_ssid) +
              "&enc=" + encodeURIComponent(t.enc) +
              "&key=" + encodeURIComponent(t.key) +
              "&hidden=" + encodeURIComponent(t.hidden) +
              "&disabled=" + t.disabled +
              "&roam=" + t.roam +
              "&isolate=" + t.isolate +
              "&wnm=" + t.wnm;

            ajax("POST", BASE + "/save_smart_ap", body, function (r) {
              if (r.pending) {
                document.getElementById("save-overlay").classList.remove("show");
                toast("err", r.message || "Changes are still awaiting confirmation.");
                return;
              }
              if (!r.success) errorMsg = r.message || "Save failed";
              nextTask(i + 1);
            });
          }
        }
        nextTask(0);
      };
    }

    function deleteSmartAp(ssid) {
      if (!confirm("Are you sure you want to remove SSID '" + ssid + "' from all radios?")) return;
      document.getElementById("save-overlay").classList.add("show");
      ajax("POST", BASE + "/delete_smart_ap", "ssid=" + encodeURIComponent(ssid), function (r) {
        document.getElementById("save-overlay").classList.remove("show");
        if (r.success) {
          toast("ok", "SSID deleted");
          loadConfig();
        } else {
          toast("err", r.message || "Failed to delete");
        }
      });
    }

    loadConfig();
