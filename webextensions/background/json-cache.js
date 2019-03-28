/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log as internalLogger,
  dumpTab,
  configs
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import * as TabsStore from '/common/tabs-store.js';
import * as TabsUpdate from '/common/tabs-update.js';
import * as MetricsData from '/common/metrics-data.js';

import Tab from '/common/Tab.js';

function log(...args) {
  internalLogger('background/json-cache', ...args);
}

export function getWindowSignature(tabs) {
  const tabIds = tabs.map(tab => tab.id);
  return tabs.map(tab => `${tab.openerTabId ? tabIds.indexOf(tab.openerTabId) : -1 },${tab.cookieStoreId},${tab.incognito},${tab.pinned}`);
}

export function trimSignature(signature, ignoreCount) {
  if (!ignoreCount || ignoreCount < 0)
    return signature;
  return signature.slice(ignoreCount);
}

export function trimTabsCache(cache, ignoreCount) {
  if (!ignoreCount || ignoreCount < 0)
    return cache;
  return cache.slice(ignoreCount);
}

export function matcheSignatures(signatures) {
  return (
    signatures.actual &&
    signatures.cached &&
    signatures.actual.slice(-signatures.cached.length).join('\n') == signatures.cached.join('\n')
  );
}

export function signatureFromTabsCache(cachedTabs) {
  const cachedTabIds = cachedTabs.map(tab => tab.id);
  return cachedTabs.map(tab => `${tab.$TST.parentId ? cachedTabIds.indexOf(tab.$TST.parentId) : -1 },${tab.cookieStoreId},${tab.incognito},${tab.pinned}`);
}

export async function restoreTabsFromCacheInternal(params) {
  MetricsData.add('restoreTabsFromCacheInternal: start');
  log(`restoreTabsFromCacheInternal: restore tabs for ${params.windowId} from cache`);
  const offset = params.offset || 0;
  const window = TabsStore.windows.get(params.windowId);
  const tabs   = params.tabs.slice(offset).map(tab => Tab.get(tab.id));
  if (offset > 0 &&
      tabs.length <= offset) {
    log('restoreTabsFromCacheInternal: missing window');
    return [];
  }
  log(`restoreTabsFromCacheInternal: there is ${window.tabs.size} tabs`);
  if (params.cache.length != tabs.length) {
    log('restoreTabsFromCacheInternal: Mismatched number of restored tabs?');
    return [];
  }
  try {
    await MetricsData.addAsync('rebuildAll: fixupTabsRestoredFromCache', fixupTabsRestoredFromCache(tabs, params.permanentStates, params.cache));
  }
  catch(e) {
    log(String(e), e.stack);
    throw e;
  }
  log('restoreTabsFromCacheInternal: done');
  if (configs.debug)
    Tab.dumpAll();
  return tabs;
}

async function fixupTabsRestoredFromCache(tabs, permanentStates, cachedTabs) {
  MetricsData.add('fixupTabsRestoredFromCache: start');
  if (tabs.length != cachedTabs.length)
    throw new Error(`fixupTabsRestoredFromCache: Mismatched number of tabs restored from cache, tabs=${tabs.length}, cachedTabs=${cachedTabs.length}`);
  log('fixupTabsRestoredFromCache start ', { tabs: tabs.map(dumpTab), cachedTabs });
  const idMap = new Map();
  // step 1: build a map from old id to new id
  tabs = tabs.map((tab, index) => {
    const cachedTab = cachedTabs[index];
    const oldId     = cachedTab.id;
    tab = Tab.get(tab.id);
    log(`fixupTabsRestoredFromCache: remap ${oldId} => ${tab.id}`);
    idMap.set(oldId, tab);
    return tab;
  });
  MetricsData.add('fixupTabsRestoredFromCache: step 1 done.');
  // step 2: restore information of tabs
  tabs.forEach((tab, index) => {
    fixupTabRestoredFromCache(tab, permanentStates[index], cachedTabs[index], idMap);
  });
  MetricsData.add('fixupTabsRestoredFromCache: step 2 done.');
}

function fixupTabRestoredFromCache(tab, permanentStates, cachedTab, idMap) {
  tab.$TST.clear();
  tab.$TST.states = new Set([...cachedTab.$TST.states, ...permanentStates]);
  tab.$TST.attributes = cachedTab.$TST.attributes;

  log('fixupTabRestoredFromCache children: ', cachedTab.$TST.childIds);
  const childTabs = cachedTab.$TST.childIds
    .map(oldId => idMap.get(oldId))
    .filter(tab => !!tab);
  tab.$TST.children = childTabs;
  if (childTabs.length > 0)
    tab.$TST.setAttribute(Constants.kCHILDREN, `|${childTabs.map(tab => tab.id).join('|')}|`);
  else
    tab.$TST.removeAttribute(Constants.kCHILDREN);
  log('fixupTabRestoredFromCache children: => ', tab.$TST.childIds);

  log('fixupTabRestoredFromCache parent: ', cachedTab.$TST.parentId);
  const parentTab = idMap.get(cachedTab.$TST.parentId) || null;
  tab.$TST.parent = parentTab;
  if (parentTab)
    tab.$TST.setAttribute(Constants.kPARENT, parentTab.id);
  else
    tab.$TST.removeAttribute(Constants.kPARENT);
  log('fixupTabRestoredFromCache parent: => ', tab.$TST.parentId);

  if (parentTab &&
      (parentTab.$TST.collapsed ||
       parentTab.$TST.subtreeCollapsed)) {
    tab.$TST.addState(Constants.kTAB_STATE_COLLAPSED);
    tab.$TST.addState(Constants.kTAB_STATE_COLLAPSED_DONE);
  }
  else {
    tab.$TST.removeState(Constants.kTAB_STATE_COLLAPSED);
    tab.$TST.removeState(Constants.kTAB_STATE_COLLAPSED_DONE);
  }

  TabsStore.updateIndexesForTab(tab);
  TabsUpdate.updateTab(tab, tab, { forceApply: true, onlyApply: true });
}