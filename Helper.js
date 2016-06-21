module.exports = (function () {
  return {
    keygen: function (l) {
      l = l || 8;

      var text = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      
      for( var i=0; i < l; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));
      
      return text;
    }
  };
})();
