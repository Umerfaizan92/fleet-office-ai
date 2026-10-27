import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEmail,platformBrand} from '../src/email-templates.js';
test('email frame preserves branded actions, plain text and escaped private values',()=>{
 const result=renderEmail(platformBrand({PUBLIC_BASE_URL:'https://example.test'}),{heading:'Join <team>',paragraphs:['Welcome & verify'],facts:[['Code','123456']],button:{label:'Continue',url:'https://example.test/invite#private'},notes:['Expires in 10 minutes']});
 assert.match(result.html,/Join &lt;team&gt;/);assert.match(result.html,/background:#090b10/);assert.match(result.html,/https:\/\/example.test\/invite#private/);
 assert.match(result.text,/Code: 123456/);assert.match(result.text,/Continue: https:\/\/example.test\/invite#private/);
 assert.doesNotMatch(renderEmail({name:'Business',color:'#000000'},{heading:'Review',button:{label:'Open',url:'javascript:alert(1)'}}).html,/javascript:/);
 assert.match(renderEmail({name:'Business',color:'#000000'},{heading:'Review',button:{label:'Open',url:'https://example.test'}}).html,/color:#ffffff;text-decoration:none/);
});
