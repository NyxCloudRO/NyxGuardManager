#!/usr/bin/env python3
import importlib.util,pathlib,sys,unittest
spec=importlib.util.spec_from_file_location('guard',pathlib.Path(__file__).with_name('native-dialog-check.py'));guard=importlib.util.module_from_spec(spec);sys.modules['guard']=guard;spec.loader.exec_module(guard)
class NativeDialogGuardTests(unittest.TestCase):
 def test_native_variants(self):
  for source in ['window.confirm("x")','confirm("x")','globalThis.alert("x")','self.prompt("x")','const b=window;b.confirm("x")','const decide=window.confirm;decide("x")','const {confirm:ask}=window;ask("x")',"window['con'+'firm']('x')",'const key="alert";window[key]("x")','window.confirm.bind(window)("x")','Reflect.get(window,"confirm")("x")','eval("window.confirm(1)")','new Function("return confirm(1)")()',"`${window.confirm('x')}`",r'window["\u0063onfirm"]("x")']:
   with self.subTest(source=source):self.assertTrue(guard.audit(source)[0])
 def test_non_native_variants(self):
  for source in ['// window.confirm("x")\nconst x=1','const message="window.confirm(x)"','const pattern=/window.confirm\\(x\\)/','dialog.confirm("x")','function confirm(x){return x} confirm(true)','function f(confirm){return confirm(true)}','const confirm=x=>x;confirm(true)','function f(window){window.confirm("x")}','window["setTimeout"](f)',"`literal window.confirm('x')`"]:
   with self.subTest(source=source):self.assertFalse(guard.audit(source)[0])
 def test_local_shadow_does_not_hide_other_scope(self):
  self.assertTrue(guard.audit('function f(confirm){confirm(true)} function g(){confirm(true)}')[0])
 def test_dynamic_members_are_reported(self):
  violations,reviews=guard.audit('window[unknown]("x")');self.assertFalse(violations);self.assertTrue(reviews)
if __name__=='__main__':unittest.main()
