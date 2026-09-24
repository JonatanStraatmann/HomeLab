(function () {
  "use strict";

  // Boot splash: a plain sibling of #reactRoot (see index.html), so it
  // survives React mounting/unmounting its own content underneath. Keep it
  // up until something real is actually on screen - the login form's
  // username field, or a loaded row of cards on the home page - instead of
  // letting it disappear the instant the JS bundle finishes booting, which
  // is what made the page feel like it was "loading in pieces".
  function bootSplashReady() {
    return !!(
      document.querySelector("input#txtManualName") ||
      document.querySelector(".itemsContainer .card .cardImageContainer:not([style*='none'])") ||
      document.querySelector(".formDialogContent")
    );
  }

  function removeBootSplash() {
    var el = document.getElementById("taiflix-boot-splash");
    if (!el) return;
    el.style.transition = "opacity .4s ease";
    el.style.opacity = "0";
    setTimeout(function () {
      el.remove();
    }, 450);
  }

  (function watchBootSplash() {
    var elapsed = 0;
    var step = 150;
    var maxWait = 6000;
    var timer = setInterval(function () {
      elapsed += step;
      if (bootSplashReady() || elapsed >= maxWait) {
        clearInterval(timer);
        removeBootSplash();
      }
    }, step);
  })();

  var HERO_ID = "taiflix-hero";
  var HERO_HEIGHT = "56vh";
  var SELECTOR_FIRST_CARD =
    ".section6 .verticalSection:first-of-type .itemsContainer .card[data-id]";
  var AUTOPLAY_PARAM = "taiflixPlay";

  function isHomeRoute() {
    return /^#\/home(\.html)?(\?|$)|^#\/?$/.test(location.hash);
  }

  function isDetailsRoute() {
    return /^#\/details\?/.test(location.hash);
  }

  function buildImageUrl(id, type) {
    return (
      location.origin +
      "/Items/" +
      id +
      "/Images/" +
      type +
      "?quality=90&fillWidth=1920"
    );
  }

  function getCredentials() {
    try {
      var raw = window.localStorage.getItem("jellyfin_credentials");
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var server = parsed && parsed.Servers && parsed.Servers[0];
      if (!server || !server.AccessToken || !server.UserId) return null;
      return { token: server.AccessToken, userId: server.UserId };
    } catch (e) {
      return null;
    }
  }

  function fetchOverview(id, cb) {
    var creds = getCredentials();
    if (!creds) return cb(null);
    fetch(
      location.origin + "/Items/" + id + "?userId=" + creds.userId,
      { headers: { "X-Emby-Token": creds.token } }
    )
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        cb(data && data.Overview ? data.Overview : null);
      })
      .catch(function () {
        cb(null);
      });
  }

  function removeHero() {
    var el = document.getElementById(HERO_ID);
    if (el) el.remove();
  }

  function alreadyBuiltFor(id) {
    var el = document.getElementById(HERO_ID);
    return el && el.getAttribute("data-hero-item") === id;
  }

  function tryBuildHero() {
    if (!isHomeRoute()) {
      removeHero();
      return;
    }

    var container = document.querySelector(".homeSectionsContainer");
    var card = document.querySelector(SELECTOR_FIRST_CARD);
    if (!container || !card) return;

    var id = card.getAttribute("data-id");
    if (!id || alreadyBuiltFor(id)) return;

    var titleLink = card.querySelector(".cardText a");
    var title = titleLink ? titleLink.textContent.trim() : "";
    var serverId = card.getAttribute("data-serverid") || "";

    removeHero();

    var hero = document.createElement("div");
    hero.id = HERO_ID;
    hero.setAttribute("data-hero-item", id);
    hero.style.cssText =
      "position:relative;width:100%;height:" +
      HERO_HEIGHT +
      ";overflow:hidden;margin-bottom:.3em;flex-shrink:0;";

    var bg = document.createElement("div");
    bg.style.cssText =
      "position:absolute;inset:0;background-size:cover;background-position:center 15%;" +
      "background-color:#000;opacity:0;transition:opacity .6s ease;";
    hero.appendChild(bg);

    var gradient = document.createElement("div");
    gradient.style.cssText =
      "position:absolute;inset:0;pointer-events:none;" +
      "background:" +
      // left->right: solid black at the edge, still almost opaque through the
      // first quarter, and only clearly fading out from the middle onward.
      "linear-gradient(to right,#000 0%,rgba(0,0,0,.95) 15%,rgba(0,0,0,.82) 25%,rgba(0,0,0,.45) 50%,rgba(0,0,0,.1) 75%,rgba(0,0,0,0) 100%)," +
      "linear-gradient(to top,#000 0%,rgba(0,0,0,.75) 12%,rgba(0,0,0,.25) 30%,rgba(0,0,0,0) 48%)," +
      "linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 18%);";
    hero.appendChild(gradient);

    var caption = document.createElement("div");
    caption.style.cssText =
      "position:absolute;left:3%;bottom:6%;max-width:38%;z-index:1;";

    var logoImg = document.createElement("img");
    logoImg.alt = title;
    logoImg.style.cssText =
      "max-width:100%;max-height:11em;object-fit:contain;display:none;" +
      "filter:drop-shadow(0 2px 10px rgba(0,0,0,.7));margin-bottom:.6em;";
    caption.appendChild(logoImg);

    var titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.cssText =
      "color:#fff;font-size:2.1em;font-weight:800;letter-spacing:.01em;" +
      "text-shadow:0 2px 10px rgba(0,0,0,.8);margin-bottom:.5em;line-height:1.1;";
    caption.appendChild(titleEl);

    var overviewEl = document.createElement("div");
    overviewEl.className = "taiflix-hero-overview";
    overviewEl.style.cssText =
      "color:rgba(255,255,255,.88);font-size:1.05em;line-height:1.4;" +
      "text-shadow:0 1px 6px rgba(0,0,0,.8);margin-bottom:1em;" +
      "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;";
    caption.appendChild(overviewEl);

    var buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:.7em;";

    var playBtn = document.createElement("a");
    playBtn.href =
      "#/details?id=" + id + "&serverId=" + serverId + "&" + AUTOPLAY_PARAM + "=1";
    playBtn.innerHTML = "&#9654;&nbsp; Assistir";
    playBtn.style.cssText =
      "display:inline-flex;align-items:center;background:#fff;color:#000;font-weight:700;" +
      "padding:.6em 1.5em;border-radius:.2em;text-decoration:none;font-size:1.05em;";
    buttonRow.appendChild(playBtn);

    var infoBtn = document.createElement("a");
    infoBtn.href = "#/details?id=" + id + "&serverId=" + serverId;
    infoBtn.textContent = "Mais informações";
    infoBtn.style.cssText =
      "display:inline-flex;align-items:center;background:rgba(109,109,110,.7);color:#fff;" +
      "font-weight:700;padding:.6em 1.5em;border-radius:.2em;text-decoration:none;font-size:1.05em;";
    buttonRow.appendChild(infoBtn);

    caption.appendChild(buttonRow);
    hero.appendChild(caption);
    container.insertBefore(hero, container.firstChild);

    // Backdrop first, Thumb then Primary as fallbacks (not every item has one).
    var candidates = ["Backdrop/0", "Thumb", "Primary"];
    (function tryNext(i) {
      if (i >= candidates.length) return;
      var probe = new Image();
      probe.onload = function () {
        bg.style.backgroundImage = 'url("' + buildImageUrl(id, candidates[i]) + '")';
        bg.style.opacity = "1";
      };
      probe.onerror = function () {
        tryNext(i + 1);
      };
      probe.src = buildImageUrl(id, candidates[i]);
    })(0);

    // Logo (same image shown on the details page hero) replaces the plain
    // text title when available; text stays as the fallback otherwise.
    var logoProbe = new Image();
    logoProbe.onload = function () {
      logoImg.src = buildImageUrl(id, "Logo");
      logoImg.style.display = "block";
      titleEl.style.display = "none";
    };
    logoProbe.src = buildImageUrl(id, "Logo");

    fetchOverview(id, function (overview) {
      if (overview) overviewEl.textContent = overview;
    });
  }

  var DETAILS_BG_ID = "taiflix-details-bg";
  var DETAILS_OVERLAY_ID = "taiflix-details-overlay";

  function removeDetailsBackdrop() {
    var a = document.getElementById(DETAILS_BG_ID);
    if (a) a.remove();
    var b = document.getElementById(DETAILS_OVERLAY_ID);
    if (b) b.remove();
  }

  // Jellyfin's own detail-page backdrop (.backdropContainer, z-index:-1) is
  // unreliable across browsers/devices (confirmed it fails to paint at all
  // in some environments even though the DOM/CSS is all correct) - so we
  // build our own the same proven way as the home hero: a plain element
  // inserted as the very FIRST node in <body>, no z-index tricks at all.
  // Everything else in the app comes later in the DOM and naturally paints
  // on top of it, so there is no negative-z-index stacking to get wrong.
  function tryBuildDetailsBackdrop() {
    if (!isDetailsRoute()) {
      removeDetailsBackdrop();
      return;
    }
    var match = location.hash.match(/[?&]id=([^&]+)/);
    var id = match && match[1];
    if (!id) return;

    var existing = document.getElementById(DETAILS_BG_ID);
    if (existing && existing.getAttribute("data-details-item") === id) return;
    removeDetailsBackdrop();

    var bg = document.createElement("div");
    bg.id = DETAILS_BG_ID;
    bg.setAttribute("data-details-item", id);
    bg.style.cssText =
      "position:fixed;inset:0;background-size:cover;background-position:center 15%;" +
      "opacity:0;transition:opacity .6s ease;pointer-events:none;";
    document.body.insertBefore(bg, document.body.firstChild);

    var overlay = document.createElement("div");
    overlay.id = DETAILS_OVERLAY_ID;
    overlay.style.cssText =
      "position:fixed;inset:0;pointer-events:none;" +
      "background:linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,.75) 55%,#000 85%);";
    bg.insertAdjacentElement("afterend", overlay);

    var candidates = ["Backdrop/0", "Thumb", "Primary"];
    (function tryNext(i) {
      if (i >= candidates.length) return;
      var probe = new Image();
      probe.onload = function () {
        bg.style.backgroundImage = 'url("' + buildImageUrl(id, candidates[i]) + '")';
        bg.style.opacity = "1";
      };
      probe.onerror = function () {
        tryNext(i + 1);
      };
      probe.src = buildImageUrl(id, candidates[i]);
    })(0);
  }

  function injectNavTabs() {
    var slider = document.querySelector(".headerTabs .emby-tabs-slider");
    if (!slider || slider.querySelector(".taiflix-navtab")) return;

    var inicioBtn = slider.querySelector('button[data-index="0"]');
    var moviesLink = document.querySelector(
      '.libraryMenuOptions a[href*="collectionType=movies"]'
    );
    var tvLink = document.querySelector(
      '.libraryMenuOptions a[href*="collectionType=tvshows"]'
    );
    if (!inicioBtn || !moviesLink || !tvLink) return;

    function makeTab(href, label) {
      var a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      a.className = "emby-tab-button emby-button taiflix-navtab";
      a.style.textDecoration = "none";
      return a;
    }

    var moviesTab = makeTab(moviesLink.getAttribute("href"), "Filmes");
    var tvTab = makeTab(tvLink.getAttribute("href"), "Séries");
    inicioBtn.insertAdjacentElement("afterend", moviesTab);
    moviesTab.insertAdjacentElement("afterend", tvTab);
  }

  var autoplayHandled = false;
  function tryAutoplay() {
    if (!isDetailsRoute() || location.hash.indexOf(AUTOPLAY_PARAM + "=1") === -1) {
      return;
    }
    if (autoplayHandled) return;
    var btn = document.querySelector('button[data-action="resume"]');
    if (!btn) return;
    autoplayHandled = true;
    btn.click();
    var cleanHash = location.hash.replace(
      new RegExp("[?&]" + AUTOPLAY_PARAM + "=1"),
      ""
    );
    history.replaceState(null, "", cleanHash);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      tryBuildHero();
      tryBuildDetailsBackdrop();
      tryAutoplay();
      if (isHomeRoute()) {
        injectNavTabs();
      }
    }, 250);
  }

  window.addEventListener("hashchange", function () {
    autoplayHandled = false;
    schedule();
  });
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  schedule();
})();
