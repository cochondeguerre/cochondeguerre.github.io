(function () {
    'use strict';

    function ViewModel() {
        var self = this;
        self.data = ko.observableArray([]);
        self.activeTypes = ko.observableArray([]);
        self.types = ko.observableArray([]);
        self.categories = ko.observableArray([]);
        self.activeCats = ko.observableArray([]);
        self.searchQuery = ko.observable('');
        self.expandedItem = ko.observable(null);

        self.toggleExpand = function (item) {
            if (self.expandedItem() === item) {
                self.expandedItem(null);
            } else {
                self.expandedItem(item);
            }
        };

        self.toggleType = function (type) {
            if (self.activeTypes.indexOf(type) >= 0) {
                self.activeTypes.remove(type);
            } else {
                self.activeTypes.push(type);
            }
            console.log(self.activeTypes)
        };

        self.toggleCat = function (cat) {
            if (self.activeCats.indexOf(cat) >= 0) {
                self.activeCats.remove(cat);
            } else {
                self.activeCats.push(cat);
            }
        };

        function esc(s) {
            var d = document.createElement('div');
            d.appendChild(document.createTextNode(s));
            return d.innerHTML;
        }

        function highlightName(name, query) {
            if (!query) return esc(name);
            var lower = name.toLowerCase();
            var idx = lower.indexOf(query);
            if (idx < 0) return esc(name);
            return esc(name.substring(0, idx))
                 + '<span class="fz-hl">' + esc(name.substring(idx, idx + query.length)) + '</span>'
                 + esc(name.substring(idx + query.length));
        }

        self.filteredData = ko.computed(function () {
            var query = self.searchQuery().toLowerCase();
            var types = self.activeTypes();
            var cats = self.activeCats();

            return self.data().filter(function (item) {
                var matchType = types.length === 0 || types.indexOf(item.type.toLowerCase()) >= 0;
                var matchCat = cats.length === 0 || cats.indexOf(item.category) >= 0;
                var matchQuery = !query || item.name.toLowerCase().indexOf(query) >= 0;
                return matchType && matchCat && matchQuery;
            }).slice(0, 50).map(function (item, index) {
                return Object.assign({}, item, {
                    highlightedName: highlightName(item.name, query)
                });
            });
        }).extend({ rateLimit: 100 });
        self.filteredData.subscribe(function (items) {
            if (items.length > 0) {
                self.expandedItem(items[0]);
            } else {
                self.expandedItem(null);
            }
        });

        self.loadData = function () {
            fetch('/data/sdl_docs.json')
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    self.data(json);
                })
                .catch(function (err) { console.error('Failed to load index:', err); });
            
            fetch('/data/metadata.json')
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    console.log(json.types)
                    self.types(json.types);
                    self.categories(json.categories);
                })
                .catch(function (err) { console.error('Failed to load filters:', err); });
        };

        self.loadData();
    }

    ko.applyBindings(new ViewModel());
})();