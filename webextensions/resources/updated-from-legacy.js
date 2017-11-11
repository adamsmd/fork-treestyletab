/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#title').textContent = document.title = `${browser.i18n.getMessage('extensionName')} ${browser.runtime.getManifest().version}`;
  document.querySelector('#description').textContent = browser.i18n.getMessage('message.updatedFromLegacy.description');
  document.querySelector('#migrateSessions').innerHTML = browser.i18n.getMessage('message.updatedFromLegacy.migrateSessions');
}, { once: true });
