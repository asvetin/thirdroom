#ifndef __websg_vector3_js_h
#define __websg_vector3_js_h
#include <math.h>
#include "../quickjs/quickjs.h"

typedef struct WebSGVector3Data {
  uint32_t resource_id;
  float_t elements[3];
  float_t (*get)(uint32_t resource_id, float_t *elements, int index);
  void (*set)(uint32_t resource_id, float_t *element, int index, float_t value);
} WebSGVector3Data;

static JSClassID js_websg_vector3_class_id;

void js_websg_define_vector3(JSContext *ctx, JSValue websg);

int js_websg_define_vector3_prop(
  JSContext *ctx,
  JSValue obj,
  const char *name,
  uint32_t resource_id,
  float_t (*get)(uint32_t resource_id, float_t *elements, int index),
  void (*set)(uint32_t resource_id, float_t *elements, int index, float_t value)
);

#endif
