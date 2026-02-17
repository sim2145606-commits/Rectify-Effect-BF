cmake_minimum_required(VERSION 3.18.1)
project("virtucam-native")

add_library(
    virtucam-native
    SHARED
    yuv_encoder.cpp
)

target_link_libraries(
    virtucam-native
    log
)
