/* regina-config.h for the WebAssembly build (hand-written, replaces the
   CMake-generated header). No census database backend is defined: census
   lookups are done in JavaScript against the bundled .zsig files. */

#define INTERNAL___INT128_T_FOUND
#define NUMERIC_64_LL_FOUND
#define LEXCMP_FOUND

#define ICONV_CONST
#define REGINA_DATADIR "/regina"
#define REGINA_PYLIBDIR "/regina/python"
#define REGINA_DB_EXT ".db"

#define PACKAGE_STRING "Regina 7.4.1"
#define PACKAGE_VERSION "7.4.1"
#define PACKAGE_VERSION_MAJOR 7
#define PACKAGE_VERSION_MINOR 4
#define BUILD_INFO "WebAssembly"
#define PACKAGE_BUILD_STRING "Regina 7.4.1 (WebAssembly)"
#define SNAPPY_VERSION "3.0.3"
