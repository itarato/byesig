const byesig = require('./script/byesig.js');

exports.activate = byesig.activate;
module.exports = {
	activate: byesig.activate,
	deactivate: function() {},
}
