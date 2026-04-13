// ================================================================
// Configuration de Marked.js
// ================================================================
(function () {
    var renderer = new marked.Renderer();

    renderer.link = function (href, title, text) {
        if (href && !href.includes('://') && !href.startsWith('/') && !href.startsWith('#')) {
            var module = window.__currentPageModule || 'SDL3';
            var anchor = module.toLowerCase() + '/' + href.toLowerCase();
            return '<a href="#' + anchor + '">' + text + '</a>';
        }
        var t = title ? ' title="' + title + '"' : '';
        return '<a href="' + href + '"' + t + ' target="_blank" rel="noopener">' + text + '</a>';
    };

    marked.setOptions({ renderer: renderer, gfm: true, breaks: false });
})();

// ================================================================
// Knockout ViewModel
// ================================================================
function AppViewModel() {
    var self = this;

    // ── State ──────────────────────────────────────────────
    self.entries        = ko.observableArray([]);
    self.query          = ko.observable('');
    self.activeFilter   = ko.observable('all');
    self.isLoading      = ko.observable(true);
    self.searchFocused  = ko.observable(false);

    // ── Routing ────────────────────────────────────────────
    self.currentView = ko.observable('search');
    self.pageHtml    = ko.observable('');
    self.pageModule  = ko.observable('');
    self.pageName    = ko.observable('');
    self.pageWikiUrl = ko.observable('');
    self.pageLoading = ko.observable(false);
    self.pageError   = ko.observable('');

    // ── Theme ──────────────────────────────────────────────
    var savedTheme = localStorage.getItem('sdl3-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    self.isDark = ko.observable(savedTheme === 'dark');

    self.toggleTheme = function () {
        var next = self.isDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('sdl3-theme', next);
        self.isDark(next === 'dark');
    };

    // ── Filters ────────────────────────────────────────────
    self.setFilter = function (type) {
        self.activeFilter(type);
    };

    // ── Poids par type ─────────────────────────────────────
    var TYPE_WEIGHT = {
        'function': 60, 'struct': 50, 'enum': 40,
        'macro': 30, 'datatype': 20, 'enumerators': 5, 'unknown': 0
    };

    // ── Fuzzy search ───────────────────────────────────────
    function fuzzyMatch(text, pattern) {
        if (!pattern) return { match: true, score: 0 };
        text = text.toLowerCase();
        pattern = pattern.toLowerCase();

        if (text === pattern) return { match: true, score: 100000 };

        var idx = text.indexOf(pattern);
        if (idx !== -1) {
            var lengthBonus = Math.max(0, 100 - (text.length - pattern.length) * 5);
            return { match: true, score: 2000 - idx * 10 + lengthBonus };
        }

        var ti = 0, pi = 0, score = 0;
        while (ti < text.length && pi < pattern.length) {
            if (text[ti] === pattern[pi]) {
                score += 10;
                if (ti > 0 && text[ti - 1] === pattern[pi - 1]) score += 5;
                if (ti > 0 && text[ti - 1] === '_') score += 8;
                pi++;
            }
            ti++;
        }

        return pi === pattern.length
            ? { match: true, score: score }
            : { match: false, score: 0 };
    }

    // ── Filtered + searched entries ────────────────────────
    self.filteredEntries = ko.computed(function () {
        var q      = self.query().trim();
        var filter = self.activeFilter();
        var all    = self.entries();

        var filtered = filter === 'all'
            ? all
            : all.filter(function (e) { return e.type === filter; });

        if (!q) return filtered;

        var scored = [];
        for (var i = 0; i < filtered.length; i++) {
            var entry = filtered[i];
            var nameResult  = fuzzyMatch(entry.name, q);
            var briefResult = fuzzyMatch(entry.brief, q);

            if (nameResult.match || briefResult.match) {
                scored.push({
                    entry: entry,
                    score: nameResult.score * 3 + briefResult.score + (TYPE_WEIGHT[entry.type] || 0)
                });
            }
        }

        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.map(function (s) { return s.entry; });
    });

    self.displayedEntries = ko.computed(function () {
        return self.filteredEntries().slice(0, 100);
    });

    // ── Highlight du nom ───────────────────────────────────
    self.highlightName = function (name) {
        var q = self.query().trim();
        if (!q) return self.escapeHtml(name);

        var nameLower = name.toLowerCase();
        var qLower = q.toLowerCase();

        var idx = nameLower.indexOf(qLower);
        if (idx !== -1) {
            var before = self.escapeHtml(name.substring(0, idx));
            var match  = self.escapeHtml(name.substring(idx, idx + q.length));
            var after  = self.escapeHtml(name.substring(idx + q.length));
            return before + '<mark>' + match + '</mark>' + after;
        }

        var result = '', pi = 0;
        for (var ti = 0; ti < name.length; ti++) {
            if (pi < qLower.length && name[ti].toLowerCase() === qLower[pi]) {
                result += '<mark>' + self.escapeHtml(name[ti]) + '</mark>';
                pi++;
            } else {
                result += self.escapeHtml(name[ti]);
            }
        }
        return result;
    };

    self.escapeHtml = function (str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    // ── Selection (bottom panel) ────────────────────────────
    self.selectedEntry = ko.observable(null);

    self.selectEntry = function (entry) {
        if (self.selectedEntry() === entry) {
            self.selectedEntry(null);
            history.replaceState(null, '', window.location.pathname);
        } else {
            self.selectedEntry(entry);
            history.replaceState(null, '', '#' + entry.name.toLowerCase());
        }
    };

    self.closeDetail = function () {
        self.selectedEntry(null);
        history.replaceState(null, '', window.location.pathname);
    };

    self.openPage = function (entry) {
        self.selectedEntry(null);
        var module = entry.module || 'SDL3';
        window.location.hash = module.toLowerCase() + '/' + entry.name.toLowerCase();
    };

    self.goHome = function () {
        self.selectedEntry(null);
        window.location.hash = '';
    };

    // ── Chargement d'une page markdown ─────────────────────
    var WIKI_MODULE_MAP = {
        'sdl3': 'SDL3', 'sdl3_image': 'SDL3_image',
        'sdl3_mixer': 'SDL3_mixer', 'sdl3_ttf': 'SDL3_ttf',
        'sdl3_net': 'SDL3_net'
    };

    self.loadPage = function (module, name) {
        self.currentView('page');
        self.pageLoading(true);
        self.pageError('');
        self.pageHtml('');
        self.pageModule(module);
        self.pageName(name);

        var wikiModule = WIKI_MODULE_MAP[module.toLowerCase()] || module;
        self.pageWikiUrl('https://wiki.libsdl.org/' + wikiModule + '/' + name);

        var realName = name;
        var all = self.entries();
        for (var i = 0; i < all.length; i++) {
            if (all[i].name.toLowerCase() === name.toLowerCase()) {
                realName = all[i].name;
                break;
            }
        }

        var docsFolder = WIKI_MODULE_MAP[module.toLowerCase()] || module;
        var mdUrl = 'docs/' + docsFolder + '/' + realName + '.md';
        window.__currentPageModule = docsFolder;

        fetch(mdUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('Fichier non trouvé : ' + mdUrl);
                return res.text();
            })
            .then(function (md) {
                self.pageHtml(marked.parse(md));
                self.pageLoading(false);
                window.scrollTo(0, 0);
            })
            .catch(function (err) {
                self.pageError(err.message);
                self.pageLoading(false);
            });
    };

    // ── Router ─────────────────────────────────────────────
    self.handleRoute = function () {
        var hash = window.location.hash.replace('#', '');

        if (!hash) {
            self.currentView('search');
            self.selectedEntry(null);
            return;
        }

        var parts = hash.split('/');
        if (parts.length === 2) {
            self.selectedEntry(null);
            self.loadPage(parts[0], parts[1]);
        } else {
            self.currentView('search');
            var name = hash.toLowerCase();
            var all = self.entries();
            for (var i = 0; i < all.length; i++) {
                if (all[i].name.toLowerCase() === name) {
                    self.selectedEntry(all[i]);
                    return;
                }
            }
        }
    };

    window.addEventListener('hashchange', function () {
        self.handleRoute();
    });

    // ── Keyboard shortcuts ─────────────────────────────────
    document.addEventListener('keydown', function (e) {
        if (e.key === '/' && !self.searchFocused() && self.currentView() === 'search') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }

        if (e.key === 'Escape') {
            if (self.currentView() === 'page') {
                self.goHome();
            } else if (self.selectedEntry()) {
                self.closeDetail();
            } else {
                document.getElementById('searchInput').blur();
                self.searchFocused(false);
            }
        }
    });

    // ── Charger la BDD JSON ────────────────────────────────
    fetch('data/sdl3_db.json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            self.entries(data);
            self.isLoading(false);
            self.handleRoute();
        })
        .catch(function (err) {
            console.error('Erreur chargement JSON:', err);
            self.isLoading(false);
        });
}

ko.applyBindings(new AppViewModel());
