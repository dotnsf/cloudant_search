// bulk_docs.js

var Cloudantlib = require( '@cloudant/cloudant' );
var crypto = require( 'crypto' );
var fs = require( 'fs' );
//var jwt = require( 'jsonwebtoken' );

var settings = require( './settings' );

var insert = true;
var filename = 'documents.json';

for( var i = 2; i < process.argv.length; i ++ ){
  if( process.argv[i].charAt( 0 ) == '-' ){
    switch( process.argv[i].charAt( 1 ).toLowerCase() ){
    case 'd':
      insert = false;
      break;
    case 'i':
      insert = true;
      break;
    case 'f':
      filename = process.argv[i].substr( 2 );
      break;
    }
  }
}

var db = null;
if( settings.db_username && settings.db_password ){
  //. Cloudant
  var params = { account: settings.db_username, password: settings.db_password };
  if( settings.db_hostname ){
    var protocol = settings.db_protocol ? settings.db_protocol : 'http';
    var url = protocol + '://' + settings.db_username + ":" + settings.db_password + "@" + settings.db_hostname;
    if( settings.db_port ){
      url += ( ":" + settings.db_port );
    }
    params = { url: url };
  }
  var cloudant = Cloudantlib( params );

  if( cloudant ){
    cloudant.db.get( settings.db_name, function( err, body ){
      if( !err ){
        db = cloudant.db.use( settings.db_name );

        if( db ){
          if( insert ){
            fs.readFile( filename, 'utf-8', function( err, body ){
              var docs = [];
              var _docs = JSON.parse( body );
              _docs.forEach( function( doc ){
                doc.timestamp = ( new Date() ).getTime();
                docs.push( doc );
              });
              //console.log( docs );
              db.bulk( { docs: docs }, function( err ){});
              console.log( 'bulk insert done.' );
            });
          }else{
            db.list( { include_docs: true }, function( err, body ){
              if( !err ){
                var docs = [];
                body.rows.forEach( function( doc ){
                  var _id = doc.id;
                  var _doc = JSON.parse( JSON.stringify( doc.doc ) );
                  if( _id.indexOf( '_' ) !== 0 ){
                    var _rev = _doc._rev;
                    docs.push( { _id: _id, _rev: _rev, _deleted: true } );
                  }
                });

                if( docs.length > 0 ){
                  //console.log( docs );
                  db.bulk( { docs: docs }, function( err ){});
                  console.log( 'bulk delete done.' );
                }
              }else{
                console.log( 'error: failed to list docs.' );
              }
            });
          }
        }
      }else{
        if( err.statusCode == 404 ){
          cloudant.db.create( settings.db_name, function( err, body ){
            if( err ){
              //. 'Error: server_admin access is required for this request' for Cloudant Local
              //. 'Error: insernal_server_error'
              db = null;
            }else{
              db = cloudant.db.use( settings.db_name );
              //. デザインドキュメント作成
              createDesignDocuments();
            }
          });
        }else{
          db = null;
        }
      }
    });
  }else{
  }
}else{
  console.log( 'usage: $ node bulk_docs.js [-d|-i <-f(filename)>]' );
}


function createDesignDocuments(){
  //. デザインドキュメント作成

  //. Search Index
  var design_doc_search = {
    _id: "_design/search",
    language: "javascript",
    views: {
      bytimestamp: {
        map: "function (doc) { if( doc.typestamp ){ emit(doc.timestamp, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": "japanese",
        "index": "function (doc) { index( 'default', [doc.title,doc.category,doc.body].join( ' ' ) ); }"
      }
    }
  };
  db.insert( design_doc_search, function( err, body ){
    if( err ){
      console.log( "db init search: err" );
      console.log( err );
    }else{
      //console.log( "db init: " );
      //console.log( body );
    }
  });

  //. Query Index
  var design_doc_query = {
    _id: "_design/query",
    language: "query",
    views: {
      categoryindex: {
        map: {
          fields: { "category": "asc" },
          partial_filter_selector: {}
        },
        reduce: "_count",
        options: {
          "def": {
            fields: [ "category" ]
          }
        }
      }
    }
  };
  db.insert( design_doc_query, function( err, body ){
    if( err ){
      console.log( "db init query: err" );
      console.log( err );
    }else{
      //console.log( "db init query: " );
      //console.log( body );
    }
  });
}
