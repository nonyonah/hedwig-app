package com.hedwig.app.userback

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import io.userback.sdk.Userback

class UserbackModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var initialized = false

  override fun getName(): String = "UserbackModule"

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    val accessToken = options.getString("accessToken")?.trim().orEmpty()
    if (accessToken.isEmpty()) {
      promise.reject("USERBACK_NO_TOKEN", "Missing Userback access token.")
      return
    }

    val userData = options.takeIf { it.hasKey("userData") && !it.isNull("userData") }?.getMap("userData")
    val userDataMap = userData?.let { readableMapToMap(it) }

    Handler(Looper.getMainLooper()).post {
      try {
        val context = currentActivity ?: reactContext
        if (!initialized) {
          Userback.init(context, accessToken, userDataMap)
          initialized = true
        } else {
          Userback.configure(accessToken, userDataMap)
        }
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("USERBACK_START_ERROR", error.message, error)
      }
    }
  }

  @ReactMethod
  fun openForm(mode: String?, promise: Promise) {
    if (!initialized) {
      promise.reject("USERBACK_NOT_READY", "Userback has not been initialized yet.")
      return
    }

    Handler(Looper.getMainLooper()).post {
      try {
        Userback.openForm(mode = mode?.takeIf { it.isNotBlank() } ?: "general")
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("USERBACK_OPEN_ERROR", error.message, error)
      }
    }
  }

  @ReactMethod
  fun close(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        Userback.close()
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("USERBACK_CLOSE_ERROR", error.message, error)
      }
    }
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  private fun readableMapToMap(readableMap: ReadableMap): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    val iterator = readableMap.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      when (readableMap.getType(key)) {
        ReadableType.Null -> map[key] = null
        ReadableType.Boolean -> map[key] = readableMap.getBoolean(key)
        ReadableType.Number -> map[key] = readableMap.getDouble(key)
        ReadableType.String -> map[key] = readableMap.getString(key)
        ReadableType.Map -> {
          val child = readableMap.getMap(key)
          map[key] = if (child != null) readableMapToMap(child) else null
        }
        ReadableType.Array -> {
          val child = readableMap.getArray(key)
          map[key] = if (child != null) readableArrayToList(child) else null
        }
      }
    }
    return map
  }

  private fun readableArrayToList(readableArray: ReadableArray): List<Any?> {
    val list = mutableListOf<Any?>()
    for (index in 0 until readableArray.size()) {
      when (readableArray.getType(index)) {
        ReadableType.Null -> list.add(null)
        ReadableType.Boolean -> list.add(readableArray.getBoolean(index))
        ReadableType.Number -> list.add(readableArray.getDouble(index))
        ReadableType.String -> list.add(readableArray.getString(index))
        ReadableType.Map -> {
          val child = readableArray.getMap(index)
          list.add(if (child != null) readableMapToMap(child) else null)
        }
        ReadableType.Array -> {
          val child = readableArray.getArray(index)
          list.add(if (child != null) readableArrayToList(child) else null)
        }
      }
    }
    return list
  }
}
