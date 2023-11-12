const byespec = require('./script/byespec.js');

exports.activate = byespec.activate;
module.exports = {
	activate: byespec.activate,
	deactivate: function() {},
}
