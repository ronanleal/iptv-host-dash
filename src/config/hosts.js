/**
 * Lista dos 35 hosts IPTV monitorados pela aplicação iptv-host-dash
 */
const DEFAULT_HOSTS = [
  'http://interblack.pro',
  'http://psrlt.com',
  'http://epp92a.club',
  'http://trollcaze.biz',
  'http://doctorclub25.com',
  'http://imperiohd.net',
  'http://46c3hu3.click',
  'http://f5b1x6z8mk.fun',
  'http://b5erahn.cc',
  'http://bsaganss.vip',
  'http://ltvpriva.club',
  'http://equipedl.pro',
  'http://conectsup.com',
  'http://clubthief.me',
  'http://roscoe.club',
  'http://fuzlakor.club',
  'http://diogoguido.com',
  'http://phn35.xyz',
  'http://guiner.vip',
  'http://78y8945.club',
  'http://4wpztc.cc',
  'http://4dddep2e.com',
  'http://taw6zvc.cloud',
  'http://nymcsus.autos',
  'http://uabckiac.com',
  'http://ueropqe.com',
  'http://8yca8t.live',
  'http://acmu253.skin',
  'http://bdsword.com',
  'http://ep4mayy7.cloud',
  'http://741520.vip',
  'http://djs4t.cc',
  'http://muqq7yzqaz.com',
  'http://ocvtab.info',
  'http://hah9xx.io'
];

function sanitizeHost(url) {
  if (!url) return '';
  let trimmed = url.trim();
  if (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

const SANITIZED_HOSTS = DEFAULT_HOSTS.map(sanitizeHost);

module.exports = {
  DEFAULT_HOSTS: SANITIZED_HOSTS,
  sanitizeHost
};
