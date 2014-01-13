var idents = require('javascript-idents'), infer = require('tern/lib/infer'), tern = require('tern');

tern.registerPlugin('ref', function(server, options) {
  var resolvedIdents = [], unresolvedIdents = [];
  return {
    passes: {
      preCondenseReach: function(state) {
        var prevGetSpan = state.getSpan;
        state.getSpan = function(node) {
          var span = prevGetSpan.apply(this, [node]);
          if (span) return node.origin + '@' + span;
        }
      },
      postCondenseReach: function(state) {
        var c = {};
        function getSpan(filename, node) {
          return filename + '@' + node.start + '-' + node.end;
        }
        function getPath(filename, node) {
          return c[getSpan(filename, node)];
        };
        function setPath(span, path) {
          span = span.replace(/\[\d+:\d+\]/g, '');
          if (c[span]) console.error('warning:', 'key "' + span + '" is already set to path "' + c[span] + '" (updating to "' + path + '")');
          return c[span] = path;
        };

        function resolveIdent(file, ident) {
          var target = getPath(file.name, ident);
          if (target) return {path: target, file: file.name};

          try { expr = tern.findQueryExpr(file, {start: ident.start, end: ident.end}); }
          catch (e) { console.error('warning: findQueryExpr failed:', e, 'at', ident.name, 'in', file.name, ident.start + '-' + ident.end); }
          if (expr) {
            var av = infer.expressionType(expr);
            if (!av) throw new Error('!av');
            if (av.originNode) {
              var path = getPath(av.origin, av.originNode)
              if (path) return {path: path, file: av.origin};
            }
            if (av.origin) {
              target = {origin: av.origin};
              var type = av.getType(true);
              if (type) return {path: type.name, origin: av.origin};
            }
          }
        }

        Object.keys(state.types).forEach(function(path) {
          var data = state.types[path];
          if (data.span) setPath(data.span, path);
        });

        state.cx.parent.files.forEach(function(file) {
          idents.inspect(file.ast, function(ident) {
            var target = resolveIdent(file, ident);
            if (target) resolvedIdents.push({file: file.name, start: ident.start, end: ident.end, target: target})
            else unresolvedIdents.push({file: file.name, start: ident.start, name: ident.name});
          });
        });
      },
      postCondense: function(state) {
        state.output['!ref'] = resolvedIdents;
        state.output['!ref_unresolved'] = unresolvedIdents;
      },
    },
  };
});
