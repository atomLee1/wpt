function openWindow(url) {
  return new Promise(resolve => {
    const win = window.open(url, '_blank');
    add_result_callback(() => win.close());
    window.onmessage = e => {
      assert_equals(e.data, 'LOADED');
      resolve(win);
    };
  });
}

function openWindowAndExpectResult(windowURL, scriptURL, type, expectation) {
  return openWindow(windowURL).then(win => {
    const promise = new Promise(r => window.onmessage = r);
    win.postMessage({ type: type, script_url: scriptURL }, '*');
    return promise;
  }).then(msg_event => assert_equals(msg_event.data, expectation));
}

// Runs a series of tests related to content security policy on a worklet.
//
// Usage:
// runContentSecurityPolicyTests("paint");
function runContentSecurityPolicyTests(workletType) {
  // script-src and worker-src tests.
  const kWindowConfigs = [
    {
      'windowURL':
        'resources/addmodule-window.html?pipe=header(' +
        'Content-Security-Policy, script-src \'self\' \'unsafe-inline\')',
      'crossOriginExpectation': 'REJECTED',
      'message': 'should be blocked by the script-src \'self\' directive.'
    },
    {
      'windowURL':
        'resources/addmodule-window.html?pipe=header(' +
        'Content-Security-Policy, script-src ' + location.origin + ' ' +
        get_host_info().HTTPS_REMOTE_ORIGIN + ' \'unsafe-inline\')',
      'crossOriginExpectation': 'RESOLVED',
      'message':
        'should be blocked by the script-src directive specifying the origin.'
    },
    {
      'windowURL':
        'resources/addmodule-window.html?pipe=header(' +
        'Content-Security-Policy, script-src * \'unsafe-inline\')',
      'crossOriginExpectation': 'RESOLVED',
      'message':
        'should not be blocked because the script-src * directive allows it.'
    },
    {
      'windowURL':
        'resources/addmodule-window.html?pipe=header(' +
        'Content-Security-Policy, worker-src \'self\' \'unsafe-inline\')',
      'crossOriginExpectation': 'RESOLVED',
      'message':
        'should not be blocked by the worker-src directive ' +
        'because worklets obey the script-src directive.'
    }
  ];
  for (var windowConfig of kWindowConfigs) {
    promise_test(((windowConfig, t) => {
        const kScriptURL =
          get_host_info().HTTPS_REMOTE_ORIGIN +
          '/worklets/resources/empty-worklet-script-with-cors-header.js';
        return openWindowAndExpectResult(
          windowConfig.windowURL, kScriptURL, workletType,
          windowConfig.crossOriginExpectation);
      }).bind(undefined, windowConfig),
      'A remote-origin worklet ' + windowConfig.message);

    promise_test(((windowConfig, t) => {
        const kScriptURL = 'import-remote-origin-empty-worklet-script.sub.js';
        return openWindowAndExpectResult(
          windowConfig.windowURL, kScriptURL, workletType,
          windowConfig.crossOriginExpectation);
      }).bind(undefined, windowConfig),
      'A same-origin worklet importing a remote-origin script ' +
      windowConfig.message);

    promise_test(((windowConfig, t) => {
        // A worklet on HTTPS_REMOTE_ORIGIN will import a child script on
        // HTTPS_REMOTE_ORIGIN.
        const kScriptURL =
          get_host_info().HTTPS_REMOTE_ORIGIN +
          '/worklets/resources/import-empty-worklet-script-with-cors-header.js';
        return openWindowAndExpectResult(
          windowConfig.windowURL, kScriptURL, workletType,
          windowConfig.crossOriginExpectation);
      }).bind(undefined, windowConfig),
      'A remote-origin worklet importing a remote-origin script ' +
      windowConfig.message);

    promise_test(((windowConfig, t) => {
        const kScriptURL =
          '/common/redirect.py?location=' + encodeURIComponent(
              get_host_info().HTTPS_REMOTE_ORIGIN +
              '/worklets/resources/empty-worklet-script-with-cors-header.js');
        return openWindowAndExpectResult(
          windowConfig.windowURL, kScriptURL, workletType,
          windowConfig.crossOriginExpectation);
      }).bind(undefined, windowConfig),
      'A remote-origin-redirected worklet ' + windowConfig.message);

    promise_test(((windowConfig, t) => {
        const kScriptURL =
          'import-remote-origin-redirected-empty-worklet-script.sub.js';
        return openWindowAndExpectResult(
          windowConfig.windowURL, kScriptURL, workletType,
          windowConfig.crossOriginExpectation);
      }).bind(undefined, windowConfig),
      'A same-origin worklet importing a remote-origin-redirected script ' +
      windowConfig.message);
  }

  // Mixed content tests.
  const kInsecureURL =
      get_host_info().HTTP_ORIGIN +
      '/worklets/resources/empty-worklet-script-with-cors-header.js';
  for (var scriptConfig of [
      {URL: kInsecureURL,
       message: 'An insecure-origin worklet'},
      {URL: '/common/redirect.py?location=' + encodeURIComponent(kInsecureURL),
       message: 'An insecure-origin-redirected worklet'},
      {URL: 'import-insecure-origin-empty-worklet-script.sub.js',
       message: 'A same-origin worklet importing an insecure-origin script'},
      {URL: 'import-insecure-origin-redirected-empty-worklet-script.sub.js',
       message: 'A same-origin worklet ' +
                'importing an insecure-origin-redirected script'}
  ]) {
    promise_test(((scriptConfig, t) => {
        const kWindowURL = 'resources/addmodule-window.html';
        return openWindowAndExpectResult(
          kWindowURL, scriptConfig.URL, workletType, 'REJECTED');
      }).bind(undefined, scriptConfig),
      scriptConfig.message + ' should be blocked because of mixed contents.');
  }

  // upgrade-insecure-requests tests.

  // |kToBeUpgradedURL| is expected to upgraded/loaded successfully with
  // upgrade-insecure-requests is specified.
  // This relies on some unintuitive cleverness due to WPT's test setup:
  // 'Upgrade-Insecure-Requests' does not upgrade the port number, so we use
  // URLs in the form `http://[host]:[https-port]`. If the upgrade fails, the
  // load will fail, as we don't serve HTTP over the secure port.
  const kHost = get_host_info().ORIGINAL_HOST;
  const kPort = get_host_info().HTTPS_PORT;
  const kToBeUpgradedURL =
      `http://${kHost}:${kPort}/worklets/resources/empty-worklet-script-with-cors-header.js`;

  for (var scriptConfig of [
      {URL: kToBeUpgradedURL,
       message: 'An insecure-origin worklet'},
      {URL: '/common/redirect.py?location=' +
            encodeURIComponent(kToBeUpgradedURL),
       message: 'An insecure-origin-redirected worklet'},
      {URL: 'import-insecure-origin-empty-worklet-script.sub.js',
       message: 'A same-origin worklet importing an insecure-origin script'},
      {URL: 'import-insecure-origin-redirected-empty-worklet-script.sub.js',
       message: 'A same-origin worklet ' +
                'importing an insecure-origin-redirected script'}
  ]) {
    promise_test(((scriptConfig, t) => {
        const kWindowURL =
          'resources/addmodule-window.html?pipe=header(' +
          'Content-Security-Policy, upgrade-insecure-requests)';
        return openWindowAndExpectResult(
          kWindowURL, scriptConfig.URL, workletType, 'RESOLVED');
      }).bind(undefined, scriptConfig),
      scriptConfig.message +
      ' should not be blocked because of upgrade-insecure-requests.');
  }
}
