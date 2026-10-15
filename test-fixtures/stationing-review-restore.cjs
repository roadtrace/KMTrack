'use strict';
const edits=require('./stationing-review-edits.json');
exports.restore=function(source){for(const e of [...edits].reverse()){if(source.split(e.after).length!==2)throw Error('REVIEW_DIFF_NOT_EXACT');source=source.replace(e.after,e.before);}return source;};
