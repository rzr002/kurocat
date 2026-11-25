#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

// Only inspect the transport controls in NetEase's own accessibility tree.
static id attribute(id element, NSString *key) {
    CFTypeRef value = NULL;
    if (element) AXUIElementCopyAttributeValue((__bridge AXUIElementRef)element,
                                               (__bridge CFStringRef)key, &value);
    return CFBridgingRelease(value);
}

static NSArray *children(id element) {
    return attribute(element, @"AXChildren") ?: @[];
}

static id footerFor(id element, int depth, int *budget) {
    if (!element || depth > 12 || --*budget < 0) return nil;
    if ([attribute(element, @"AXSubrole") isEqual:@"AXLandmarkContentInfo"]) return element;
    NSString *role = attribute(element, @"AXRole");
    if ([@[@"AXTable", @"AXList", @"AXOutline", @"AXRow"] containsObject:role ?: @""]) return nil;
    for (id child in children(element).reverseObjectEnumerator) {
        id found = footerFor(child, depth + 1, budget);
        if (found) return found;
    }
    return nil;
}

static NSNumber *clockSeconds(NSString *value) {
    if (![value isKindOfClass:NSString.class]) return nil;
    NSArray *parts = [value componentsSeparatedByString:@":"];
    if (parts.count < 2 || parts.count > 3) return nil;
    NSInteger total = 0;
    NSCharacterSet *invalid = NSCharacterSet.decimalDigitCharacterSet.invertedSet;
    for (NSString *part in parts) {
        if (!part.length || [part rangeOfCharacterFromSet:invalid].location != NSNotFound) return nil;
        total = total * 60 + part.integerValue;
    }
    return @(total);
}

static void describeTrack(id group, int depth, NSMutableArray *names, NSMutableArray *artists) {
    if (depth > 5) return;
    NSString *role = attribute(group, @"AXRole");
    if ([role isEqual:@"AXLink"]) {
        id artist = attribute(group, @"AXTitle");
        if ([artist isKindOfClass:NSString.class] && [artist length]) [artists addObject:artist];
        return;
    }
    if ([role isEqual:@"AXStaticText"]) {
        NSString *name = attribute(group, @"AXValue");
        if ([name isKindOfClass:NSString.class] && name.length && ![name isEqual:@"-"]) [names addObject:name];
        return;
    }
    // Badges/controls in the artwork area can have their own text, for example "VIP".
    if ([role isEqual:@"AXGroup"] && ![attribute(group, @"AXDescription") length])
        for (id child in children(group)) describeTrack(child, depth + 1, names, artists);
}

static NSDictionary *snapshot(void) {
    static id footer;
    static pid_t previousPid;
    NSRunningApplication *app = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.netease.163music"].firstObject;
    if (!app) { footer = nil; return @{}; }
    if (!AXIsProcessTrusted()) return @{@"needsAccess": @YES};
    if (previousPid != app.processIdentifier) { footer = nil; previousPid = app.processIdentifier; }
    NSArray *controls = children(footer);
    if (!controls.count) {
        id root = CFBridgingRelease(AXUIElementCreateApplication(previousPid));
        AXUIElementSetMessagingTimeout((__bridge AXUIElementRef)root, 0.3);
        int budget = 220;
        for (id window in attribute(root, @"AXWindows")) {
            footer = footerFor(window, 0, &budget);
            if (footer) break;
        }
        controls = children(footer);
    }
    NSMutableArray *times = [NSMutableArray array], *names = [NSMutableArray array], *artists = [NSMutableArray array];
    BOOL playing = NO, sawTransport = NO;
    for (id control in controls) {
        NSString *role = attribute(control, @"AXRole");
        if ([role isEqual:@"AXButton"]) {
            NSString *label = attribute(control, @"AXTitle");
            if ([label isEqual:@"play"] || [label isEqual:@"pause"]) {
                sawTransport = YES;
                playing = [label isEqual:@"pause"];
            }
        } else if ([role isEqual:@"AXStaticText"]) {
            NSNumber *t = clockSeconds(attribute(control, @"AXValue"));
            if (t) [times addObject:t];
        } else if (!sawTransport && [role isEqual:@"AXGroup"] && !names.count) {
            describeTrack(control, 0, names, artists);
        }
    }
    if (!sawTransport) footer = nil;
    if (!playing || !names.count || times.count < 2) return @{};
    return @{@"playing": @YES, @"title": names.firstObject, @"artist": [artists componentsJoinedByString:@" / "],
             @"position": times[0], @"duration": times[1]};
}

char *kuro_netease_snapshot(void) {
    @autoreleasepool {
        @synchronized(NSRunningApplication.class) {
            NSData *data = [NSJSONSerialization dataWithJSONObject:snapshot() options:0 error:nil];
            NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            return strdup(json.UTF8String ?: "{}");
        }
    }
}
void kuro_free_snapshot(char *value) { free(value); }
