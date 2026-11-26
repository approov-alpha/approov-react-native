//
// MIT License
// 
// Copyright (c) 2016-present, Approov Ltd.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
// ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH
// THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

package io.approov.react;

import android.content.Context;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import io.approov.service.android.ApproovDefaultMessageSigning.SignatureParametersFactory;
import io.approov.service.android.ApproovLog;
import io.approov.service.android.ApproovLogLevel;
import io.approov.service.android.ApproovServiceMutator;

/**
 * ApproovReactNativeCore is what the TurboModule ApproovReactNative does, with no React Native type, so that it
 * can be tested on the JVM. Every method has the name of a method of the codegen spec (src/NativeApproovReactNative
 * .ts) and calls exactly one universal layer method of the same name, with its arguments unchanged: null
 * stays null and is never turned into "". It holds no Approov state of its own.
 * <p>
 * Threading: the setters, the getters and the configuration calls run on the calling thread and settle
 * their reply there. initialize, every method that calls the Approov SDK and the persisted configuration calls,
 * which read and write a file, run on this module's own threads, named approov-rn, and settle their reply there,
 * never on the calling thread. They are taken in the order JavaScript calls them: each waits its turn on a serial
 * queue, so it starts only once every earlier call that changes state (initialize, setDevKey, setDataHashInToken,
 * setInstallAttributes and the persisted configuration writes) has finished. A call that changes state runs on the
 * serial queue itself; a read, such as fetchToken, then moves to a pool, so that a long fetch does not hold up the
 * calls after it. invalidate() shuts both down, after which such a call is rejected.
 * <p>
 * Errors: a failure is a rejection with the method name as its code (ApproovReactNativeErrors). Nothing
 * here logs or reports a token, a secure string, a signature or the account ID.
 */
final class ApproovReactNativeCore {
    // logging tag
    static final String TAG = "ApproovReactNative";

    // the name of the threads of the module's executor
    static final String THREAD_NAME = "approov-rn";

    // the user property prefix of the React Native package, which the attester counts
    static final String IDENTITY_PREFIX = "approov-react-native/";

    /**
     * Reply settles the promise of one call.
     */
    interface Reply {
        void resolve(Object value);

        void reject(ApproovReactNativeErrors.Rejection rejection);
    }

    // the options file of @approov/approov-service-react-native 3.5.x, which this package never reads, as its
    // keys belong in approov.config
    static final String LEGACY_PROPS_FILE = "approov.props";

    // the warning for a 3.5.x options file still in the app
    static final String LEGACY_PROPS_WARNING = " of @approov/approov-service-react-native 3.5.x is in the app and "
            + "is never read: its keys belong in approov.config (token.name and token.prefix as tokenHeader, "
            + "binding.name as bindingHeader; init.prefetch has no replacement), then remove the file";

    // whether the 3.5.x file has been looked for in this process, as a module is created again on a reload
    private static final AtomicBoolean legacyFilesChecked = new AtomicBoolean();

    /**
     * AssetNames lists the names of the files at the top level of the app's assets.
     */
    interface AssetNames {
        String[] list() throws IOException;
    }

    /**
     * InterceptionCheck tells whether React Native's networking is protected.
     */
    interface InterceptionCheck {
        boolean isInstalled();
    }

    /**
     * Logger writes the module's log lines.
     */
    interface Logger {
        void w(String message);

        void e(String message);
    }

    // the module's lines go through the universal layer's log, so setLoggingLevel applies to them too
    static final Logger APPROOV_LOG = new Logger() {
        @Override
        public void w(String message) {
            ApproovLog.w(TAG, message);
        }

        @Override
        public void e(String message) {
            ApproovLog.e(TAG, message);
        }
    };

    // a call to make, whose result settles the reply
    private interface Call {
        Object run() throws Exception;
    }

    // the universal layer
    private final ApproovServiceApi api;

    // the application context for initialize
    private final Context applicationContext;

    // takes every executor call in call order, and runs those that change state
    private final ExecutorService serial;

    // runs the reads once their turn on the serial queue has come
    private final ExecutorService executor;

    // the protection check of React Native's networking
    private final InterceptionCheck interceptionCheck;

    // the log
    private final Logger log;

    /**
     * Constructs the core of one module instance, with its own serial queue.
     *
     * @param api is the universal layer
     * @param applicationContext is the application context, passed to initialize
     * @param executor runs the reads once their turn has come, and is owned by this core
     * @param interceptionCheck tells whether React Native's networking is protected
     * @param log is the log
     */
    ApproovReactNativeCore(ApproovServiceApi api, Context applicationContext, ExecutorService executor,
            InterceptionCheck interceptionCheck, Logger log) {
        this(api, applicationContext, newSerialExecutor(), executor, interceptionCheck, log);
    }

    /**
     * Constructs the core of one module instance.
     *
     * @param api is the universal layer
     * @param applicationContext is the application context, passed to initialize
     * @param serial takes the executor calls in call order and runs those that change state, and is owned by this core
     * @param executor runs the reads once their turn has come, and is owned by this core
     * @param interceptionCheck tells whether React Native's networking is protected
     * @param log is the log
     */
    ApproovReactNativeCore(ApproovServiceApi api, Context applicationContext, ExecutorService serial,
            ExecutorService executor, InterceptionCheck interceptionCheck, Logger log) {
        this.api = api;
        this.applicationContext = applicationContext;
        this.serial = serial;
        this.executor = executor;
        this.interceptionCheck = interceptionCheck;
        this.log = log;
    }

    // creates the module's daemon threads, named approov-rn
    private static final ThreadFactory THREAD_FACTORY = runnable -> {
        Thread thread = new Thread(runnable, THREAD_NAME);
        thread.setDaemon(true);
        return thread;
    };

    /**
     * Creates the executor of a module for the reads: threads named approov-rn, created on demand, so that a long
     * token fetch does not hold up another call, and ended after 30 seconds without work.
     *
     * @return a new executor
     */
    static ExecutorService newExecutor() {
        return new ThreadPoolExecutor(0, Integer.MAX_VALUE, 30, TimeUnit.SECONDS, new SynchronousQueue<>(),
                THREAD_FACTORY);
    }

    // creates the serial queue: one thread named approov-rn, ended after 30 seconds without work
    private static ExecutorService newSerialExecutor() {
        ThreadPoolExecutor serial = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<>(),
                THREAD_FACTORY);
        serial.allowCoreThreadTimeOut(true);
        return serial;
    }

    /**
     * Sets the user property approov-react-native/version through the universal layer's host framework hook,
     * which applies it at once if Approov is already initialized, for example natively in
     * MainApplication.onCreate, and otherwise at initialization. A failure is logged and never thrown, as the
     * property is diagnostic only.
     *
     * @param api is the universal layer
     * @param packageVersion is the npm package version
     * @param log is the log
     */
    static void identify(ApproovServiceApi api, String packageVersion, Logger log) {
        try {
            api.setHostFrameworkIdentity(IDENTITY_PREFIX + packageVersion);
        } catch (RuntimeException | LinkageError e) {
            log.e("user property " + IDENTITY_PREFIX + packageVersion + " not set: " + e);
        }
    }

    /**
     * Logs an error naming the Approov Gradle plugin if React Native's networking is not protected, which is
     * called when the module is created.
     */
    void checkInterception() {
        boolean installed;
        try {
            installed = interceptionCheck.isInstalled();
        } catch (RuntimeException | LinkageError e) {
            log.e("React Native networking protection could not be checked: " + e);
            return;
        }
        if (!installed)
            log.e("React Native networking is not protected: Approov is not the last network interceptor of "
                    + "OkHttpClientProvider. Either OkHttpClientProvider is not woven: apply the Approov Gradle plugin "
                    + "io.approov.gradle to the app module (the Expo config plugin does this). Or Approov is installed "
                    + "but not last: something appended a network interceptor after it");
    }

    /**
     * Logs a warning, once per process, if the approov.props file of @approov/approov-service-react-native 3.5.x is
     * still in the app's assets, saying that its keys belong in approov.config. Only the names are listed:
     * the file is never opened or read, so nothing in it is used or logged. approov.config itself is read by the
     * file form of initialize and gets no warning.
     *
     * @param assets lists the app's assets
     * @param log is the log
     */
    static void warnAboutLegacyFiles(AssetNames assets, Logger log) {
        if (!legacyFilesChecked.compareAndSet(false, true))
            return;
        String[] names;
        try {
            names = assets.list();
        } catch (IOException | RuntimeException e) {
            // the check is a migration aid only, so an asset listing that fails is skipped
            return;
        }
        for (String warning : legacyFileWarnings(names))
            log.w(warning);
    }

    /**
     * Gets the warnings for the files of @approov/approov-service-react-native 3.5.x among the asset names.
     *
     * @param names are the names of the files at the top level of the app's assets, or null if there are none
     * @return the warnings, one if approov.props is found and none otherwise
     */
    static List<String> legacyFileWarnings(String[] names) {
        List<String> warnings = new ArrayList<>();
        List<String> found = (names == null) ? new ArrayList<>() : Arrays.asList(names);
        if (found.contains(LEGACY_PROPS_FILE))
            warnings.add("assets/" + LEGACY_PROPS_FILE + LEGACY_PROPS_WARNING);
        return warnings;
    }

    // allows the once per process check to run again
    static void resetLegacyFilesCheckForTesting() {
        legacyFilesChecked.set(false);
    }

    /**
     * Shuts the serial queue and the executor down, letting the calls already made finish.
     */
    void invalidate() {
        // the executor is shut down from the serial queue, so a read queued before this still gets to run
        try {
            serial.execute(executor::shutdown);
        } catch (RejectedExecutionException e) {
            // already shut down
        }
        serial.shutdown();
    }

    // runs a call on the calling thread
    private void inline(String method, Reply reply, Call call) {
        settle(method, reply, call);
    }

    // runs a call that changes state on the serial queue, so that no later call starts before it has finished, or
    // rejects it once the module is shut down
    private void direct(String method, Reply reply, Call call) {
        try {
            serial.execute(() -> settle(method, reply, call));
        } catch (RejectedExecutionException e) {
            rejectShutDown(method, reply);
        }
    }

    // runs a read on the executor once every earlier call that changes state has finished, so that it sees them
    // and a long read still does not hold up the calls after it, or rejects it once the module is shut down
    private void read(String method, Reply reply, Call call) {
        try {
            serial.execute(() -> {
                try {
                    executor.execute(() -> settle(method, reply, call));
                } catch (RejectedExecutionException e) {
                    rejectShutDown(method, reply);
                }
            });
        } catch (RejectedExecutionException e) {
            rejectShutDown(method, reply);
        }
    }

    // rejects a call made once the module is shut down
    private static void rejectShutDown(String method, Reply reply) {
        reply.reject(ApproovReactNativeErrors.map(method,
                new IllegalStateException(method + ": the Approov React Native module is shut down")));
    }

    // makes a call and settles the reply with its result or its failure
    private static void settle(String method, Reply reply, Call call) {
        Object result;
        try {
            result = call.run();
        } catch (Exception | LinkageError e) {
            reply.reject(ApproovReactNativeErrors.map(method, e));
            return;
        }
        reply.resolve(result);
    }

    // ---- initialization and state ----

    /**
     * Initializes Approov on the module's executor. A null account ID is the file form, which reads the bundled
     * approov.config and takes the account ID and comment from it; otherwise the account ID and comment are
     * passed on and the file is never read.
     *
     * @param accountId is the Approov account ID, or null for the file form
     * @param comment is the comment, or null for none, and always null with the file form
     * @param reply is settled with null, or rejected with the type initialization
     */
    void initialize(String accountId, String comment, Reply reply) {
        direct("initialize", reply, () -> {
            // the file form takes the comment from approov.config
            if ((accountId == null) && (comment != null))
                throw new ApproovReactNativeErrors.ArgumentException("initialize: a comment needs an account ID, "
                        + "approov.config has its own");
            try {
                if (accountId == null)
                    api.initialize(applicationContext);
                else
                    api.initialize(applicationContext, accountId, comment);
            } catch (IllegalStateException e) {
                // the SDK refuses another account ID or comment once it is initialized
                String used = (accountId == null) ? "which come from approov.config"
                        : ("which is " + ((comment == null) ? "null" : "set"));
                log.e("initialize: the Approov SDK rejected the initialization from React Native: " + e.getMessage()
                        + ". Every initialize in the app (native code, the Expo config plugin, JavaScript) must use "
                        + "the same account ID and the same comment, " + used + " here, and the app must not call "
                        + "Approov.initialize itself");
                throw e;
            }
            return null;
        });
    }

    void isApproovServiceEnabled(Reply reply) {
        inline("isApproovServiceEnabled", reply, api::isApproovServiceEnabled);
    }

    void isApproovProtectionEnabled(Reply reply) {
        inline("isApproovProtectionEnabled", reply, api::isApproovProtectionEnabled);
    }

    void isInterceptionInstalled(Reply reply) {
        inline("isInterceptionInstalled", reply, interceptionCheck::isInstalled);
    }

    // ---- header names ----

    void setTokenHeader(String header, String prefix, Reply reply) {
        inline("setTokenHeader", reply, () -> {
            api.setTokenHeader(header, prefix);
            return null;
        });
    }

    void getTokenHeader(Reply reply) {
        inline("getTokenHeader", reply, api::getTokenHeader);
    }

    void getTokenPrefix(Reply reply) {
        inline("getTokenPrefix", reply, api::getTokenPrefix);
    }

    void setTraceIDHeader(String header, Reply reply) {
        inline("setTraceIDHeader", reply, () -> {
            api.setTraceIDHeader(header);
            return null;
        });
    }

    void getTraceIDHeader(Reply reply) {
        inline("getTraceIDHeader", reply, api::getTraceIDHeader);
    }

    void setStatusHeader(String header, Reply reply) {
        inline("setStatusHeader", reply, () -> {
            api.setStatusHeader(header);
            return null;
        });
    }

    void getStatusHeader(Reply reply) {
        inline("getStatusHeader", reply, api::getStatusHeader);
    }

    void setBindingHeader(String header, Reply reply) {
        inline("setBindingHeader", reply, () -> {
            api.setBindingHeader(header);
            return null;
        });
    }

    void getBindingHeader(Reply reply) {
        inline("getBindingHeader", reply, api::getBindingHeader);
    }

    // ---- substitutions and exclusions ----

    void addSubstitutionHeader(String header, String requiredPrefix, Reply reply) {
        inline("addSubstitutionHeader", reply, () -> {
            api.addSubstitutionHeader(header, requiredPrefix);
            return null;
        });
    }

    void removeSubstitutionHeader(String header, Reply reply) {
        inline("removeSubstitutionHeader", reply, () -> {
            api.removeSubstitutionHeader(header);
            return null;
        });
    }

    void addSubstitutionQueryParam(String key, Reply reply) {
        inline("addSubstitutionQueryParam", reply, () -> {
            api.addSubstitutionQueryParam(key);
            return null;
        });
    }

    void removeSubstitutionQueryParam(String key, Reply reply) {
        inline("removeSubstitutionQueryParam", reply, () -> {
            api.removeSubstitutionQueryParam(key);
            return null;
        });
    }

    void addExclusionURLRegex(String regex, Reply reply) {
        inline("addExclusionURLRegex", reply, () -> {
            api.addExclusionURLRegex(regex);
            return null;
        });
    }

    void removeExclusionURLRegex(String regex, Reply reply) {
        inline("removeExclusionURLRegex", reply, () -> {
            api.removeExclusionURLRegex(regex);
            return null;
        });
    }

    // ---- the service mutator, by name only ----

    void setServiceMutator(String name, Reply reply) {
        inline("setServiceMutator", reply, () -> {
            ApproovServiceMutator mutator = ApproovReactNativeMutators.forName(name);
            String replaced = ApproovReactNativeMutators.customClassName(api.getServiceMutator());
            api.setServiceMutator(mutator);
            if (replaced != null)
                log.w("setServiceMutator: the app's own service mutator " + replaced + " was replaced with "
                        + ApproovReactNativeMutators.nameOf(mutator) + " from JavaScript");
            return null;
        });
    }

    void getServiceMutator(Reply reply) {
        inline("getServiceMutator", reply, () -> ApproovReactNativeMutators.nameOf(api.getServiceMutator()));
    }

    // ---- message signing with the layer's standard factory ----

    void enableMessageSigning(Map<String, Object> options, Reply reply) {
        inline("enableMessageSigning", reply, () -> {
            SignatureParametersFactory factory = ApproovReactNativeSigning.buildFactory(options);
            warnIfCustomFactory("enableMessageSigning", null);
            api.enableMessageSigning(factory);
            return null;
        });
    }

    void setMessageSigningHostOptions(String hostName, Map<String, Object> options, Reply reply) {
        inline("setMessageSigningHostOptions", reply, () -> {
            if (hostName == null)
                throw new ApproovReactNativeErrors.ArgumentException("setMessageSigningHostOptions: null hostName");
            SignatureParametersFactory factory =
                    (options == null) ? null : ApproovReactNativeSigning.buildFactory(options);
            warnIfCustomFactory("setMessageSigningHostOptions", hostName);
            api.putMessageSigningHostFactory(hostName, factory);
            return null;
        });
    }

    // warns when the factory about to be replaced or removed is a subclass that native code installed, naming it
    // by its class only
    private void warnIfCustomFactory(String method, String hostName) {
        Class<? extends SignatureParametersFactory> current = api.getMessageSigningFactoryClass(hostName);
        if ((current != null) && (current != SignatureParametersFactory.class))
            log.w(method + ": the app's own message signing factory " + current.getName() + " for "
                    + ((hostName == null) ? "the default" : "host " + hostName) + " was replaced from JavaScript");
    }

    void disableMessageSigning(Reply reply) {
        inline("disableMessageSigning", reply, () -> {
            api.disableMessageSigning();
            return null;
        });
    }

    void isMessageSigningEnabled(Reply reply) {
        inline("isMessageSigningEnabled", reply, api::isMessageSigningEnabled);
    }

    // ---- logging and development ----

    void setLoggingLevel(String level, Reply reply) {
        inline("setLoggingLevel", reply, () -> {
            if (level == null)
                throw new ApproovReactNativeErrors.ArgumentException("setLoggingLevel: null level");
            ApproovLogLevel loggingLevel;
            try {
                loggingLevel = ApproovLogLevel.valueOf(level);
            } catch (IllegalArgumentException e) {
                throw new ApproovReactNativeErrors.ArgumentException("setLoggingLevel: unknown level " + level);
            }
            api.setLoggingLevel(loggingLevel);
            return null;
        });
    }

    void setDevKey(String devKey, Reply reply) {
        direct("setDevKey", reply, () -> {
            api.setDevKey(devKey);
            return null;
        });
    }

    // ---- direct calls to the SDK, off the calling thread ----

    void getDeviceID(Reply reply) {
        read("getDeviceID", reply, api::getDeviceID);
    }

    // resolved as a double, the number type a promise carries to JavaScript, which holds milliseconds exactly
    void getServerAdjustedCurrentTimeMS(Reply reply) {
        read("getServerAdjustedCurrentTimeMS", reply, () -> (double) api.getServerAdjustedCurrentTimeMS());
    }

    void setDataHashInToken(String data, Reply reply) {
        direct("setDataHashInToken", reply, () -> {
            api.setDataHashInToken(data);
            return null;
        });
    }

    void fetchToken(String url, Reply reply) {
        read("fetchToken", reply, () -> api.fetchToken(url));
    }

    void fetchSecureString(String key, String newDef, Reply reply) {
        read("fetchSecureString", reply, () -> api.fetchSecureString(key, newDef));
    }

    void fetchCustomJWT(String payload, Reply reply) {
        read("fetchCustomJWT", reply, () -> api.fetchCustomJWT(payload));
    }

    void getAccountMessageSignature(String message, Reply reply) {
        read("getAccountMessageSignature", reply, () -> api.getAccountMessageSignature(message));
    }

    void getInstallMessageSignature(String message, Reply reply) {
        read("getInstallMessageSignature", reply, () -> api.getInstallMessageSignature(message));
    }

    void getLastARC(Reply reply) {
        inline("getLastARC", reply, api::getLastARC);
    }

    void setInstallAttributes(String attrs, Reply reply) {
        direct("setInstallAttributes", reply, () -> {
            api.setInstallAttributes(attrs);
            return null;
        });
    }

    // ---- persisted configuration overrides, off the calling thread as they read and write a file ----

    /**
     * Stores options that the file form of initialize applies over the bundled approov.config from the next launch.
     * Nothing changes in this process. A refusal by the layer rejects with the type general and the layer's message, which
     * names the cause and never a value.
     *
     * @param json is the JSON object of the options
     * @param source is the tag naming where the options came from, or null for none
     * @param reply is settled with null, or rejected
     */
    void setPersistentConfiguration(String json, String source, Reply reply) {
        direct("setPersistentConfiguration", reply, () -> {
            api.setPersistentConfiguration(applicationContext, json, source);
            return null;
        });
    }

    /**
     * Deletes the options stored by setPersistentConfiguration, so that the bundled approov.config alone applies
     * from the next launch. Nothing changes in this process, and it is not an error if none are stored.
     *
     * @param reply is settled with null, or rejected with the type general if the stored options cannot be deleted
     */
    void clearPersistentConfiguration(Reply reply) {
        direct("clearPersistentConfiguration", reply, () -> {
            api.clearPersistentConfiguration(applicationContext);
            return null;
        });
    }

    /**
     * Gets the source tag stored with the options of setPersistentConfiguration. This is what is stored, which may
     * only apply from the next launch.
     *
     * @param reply is settled with the source tag, or null if none is stored
     */
    void getPersistentConfigurationSource(Reply reply) {
        read("getPersistentConfigurationSource", reply,
                () -> api.getPersistentConfigurationSource(applicationContext));
    }
}
