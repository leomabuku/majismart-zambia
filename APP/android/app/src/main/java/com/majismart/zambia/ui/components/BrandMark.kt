package com.majismart.zambia.ui.components

import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.majismart.zambia.R

/** Geometry and colours match WEB/public/logo.svg. */
@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    Image(painterResource(R.drawable.ic_brand), contentDescription = "SmartWater Zambia", modifier = modifier)
}
