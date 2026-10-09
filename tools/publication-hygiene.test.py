import importlib.util,io,pathlib,tarfile,unittest
path=pathlib.Path(__file__).with_name('publication-hygiene.py')
spec=importlib.util.spec_from_file_location('hygiene',path);h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Gate(unittest.TestCase):
 def scan(self,text,name='fixture.md'):
  h.findings.clear();h.check(name,text.encode());return {f['rule'] for f in h.findings}
 def test_internal_identity_and_private_path(self):
  self.assertIn('infrastructure-id',self.scan('Host '+'CT'+'123'))
  self.assertIn('private-home',self.scan('/home/'+'operator/build'))
 def test_network_examples_require_context(self):
  ip='192'+'.168.25.8'
  self.assertIn('private-address',self.scan('Deployment '+ip))
  self.assertEqual(self.scan('Example addresses are placeholders.\n'+ip),set())
 def test_secrets_and_standard_product_paths(self):
  self.assertIn('provider-token',self.scan('ghp_'+'A'*36))
  self.assertIn('private-key',self.scan('-----BEGIN '+'PRIVATE KEY-----'))
  self.assertEqual(self.scan('/opt/nyxguardmanager /run/nyxguard-licensing/vault.key'),set())
 def test_image_environment_secret_is_detected(self):
  self.assertIn('embedded-env-secret',self.scan('DB_MYSQL_PASSWORD='+'aBcD0123aBcD4567aBcD89ef'))
  self.assertEqual(self.scan('DB_MYSQL_PASSWORD=CHANGE_ME_STRONG_PASSWORD'),set())
 def test_archive_members_are_scanned(self):
  out=io.BytesIO()
  with tarfile.open(fileobj=out,mode='w') as archive:
   data=('Host '+'VM'+'345').encode();member=tarfile.TarInfo('README.md');member.size=len(data);archive.addfile(member,io.BytesIO(data))
  h.findings.clear();h.check('source.tar',out.getvalue());self.assertIn('infrastructure-id',{f['rule'] for f in h.findings})
 def test_operator_reports_are_rejected(self):
  self.assertIn('operator-report',self.scan('# Internal incident findings'))
  self.assertIn('operator-artifact',self.scan('details','operator-notes.md'))
 def test_operational_files_fail_without_printing_values(self):
  self.assertIn('operational-artifact',self.scan('never print this','.env'))
  self.assertTrue(all('value' not in f for f in h.findings))
if __name__=='__main__':unittest.main()
