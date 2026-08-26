(function(global){
  'use strict';
  var H=global.HNK=global.HNK||{};
  H.USER_LIBRARY_INDEX=global.HNK_LIBRARY_INDEX||H.USER_LIBRARY_INDEX;
  H.resolveUserLibraryId=function(id){
    var aliases=(H.USER_LIBRARY_INDEX&&H.USER_LIBRARY_INDEX.aliases)||{};
    return aliases[id]||id;
  };
  H.getUserLibraryItem=function(id){
    id=H.resolveUserLibraryId(id);
    var items=(H.USER_LIBRARY_INDEX&&H.USER_LIBRARY_INDEX.items)||[];
    for(var i=0;i<items.length;i++){if(items[i].id===id){return items[i];}}
    return null;
  };
})(window);
