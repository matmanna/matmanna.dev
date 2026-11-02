package dev.matmanna.location

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

const val KEY_TOKEN = "token"

fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences("location", Context.MODE_PRIVATE)

// One-time setup: store the worker's UPDATE_TOKEN and grant location access
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val token = EditText(this).apply {
            hint = "Update token"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(prefs(context).getString(KEY_TOKEN, ""))
        }
        val save = Button(this).apply {
            text = "Save"
            setOnClickListener {
                prefs(context).edit().putString(KEY_TOKEN, token.text.toString().trim()).apply()
                requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), 0)
                Toast.makeText(context, "Saved. Add the widget and tap it to update.", Toast.LENGTH_LONG).show()
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            addView(TextView(context).apply {
                text = "Paste the UPDATE_TOKEN set on the location worker."
                textSize = 16f
            })
            addView(token)
            addView(save)
        })
    }
}
